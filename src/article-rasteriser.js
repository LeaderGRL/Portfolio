import { SRC_H, SRC_W } from './core.js'
import { getDocumentTheme } from './document/themes.js'

const COLORS = {
  bg: '#031009',
  panel: '#06170d',
  dim: '#167f45',
  mid: '#2fd06d',
  bright: '#6bf39a',
  core: '#b9ffc9',
  amber: '#ffb347',
  glowInner: 'rgba(16,64,36,.36)',
  glowOuter: 'rgba(2,10,5,0)',
}

const FONT = 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace'

function words(text = '') {
  return String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
}

function stripInline(text = '') {
  return String(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
}

export class ArticleRasteriser {
  constructor(canvas, reader, onDirty = () => {}, options = {}) {
    this.canvas = canvas
    this.canvas.width = SRC_W
    this.canvas.height = SRC_H
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.width = SRC_W
    this.height = SRC_H
    this.readingHeight = SRC_H
    this.fullscreen = false
    this.reader = reader
    this.onDirty = onDirty
    this.blockRegistry = options.blockRegistry || null
    this.item = null
    this.scroll = 0
    this.maxScroll = 0
    this.layout = []
    this.images = new Map()
    this.videoNodes = []
    this.dirty = true

    reader?.addEventListener('scroll', () => {
      this._syncScrollFromDOM()
      this.markDirty()
    }, { passive: true })
  }

  markDirty() {
    this.dirty = true
    this.onDirty()
  }

  setViewport(layout) {
    this.fullscreen = Boolean(layout)
    const width = layout?.documentWidth || SRC_W
    const height = layout?.documentHeight || SRC_H
    const readingHeight = height - (layout?.documentBottom || 0)
    const pixelsW = layout?.pixelWidth || SRC_W
    const pixelsH = layout?.pixelHeight || SRC_H
    if (this.width === width && this.height === height && this.readingHeight === readingHeight && this.canvas.width === pixelsW && this.canvas.height === pixelsH) return false
    const progress = this.maxScroll ? this.scroll / this.maxScroll : 0
    this.width = width
    this.height = height
    this.readingHeight = readingHeight
    this.canvas.width = pixelsW
    this.canvas.height = pixelsH
    if (this.item) this._layout()
    this.scroll = progress * this.maxScroll
    this.markDirty()
    return true
  }

  setItem(item) {
    if (this.item?.id === item?.id) return false
    this.item = item || null
    Object.assign(COLORS, getDocumentTheme(this.item?.theme))
    this.scroll = 0
    this.layout = []
    this.videoNodes = []
    if (this.reader) this.reader.scrollTop = 0
    if (this.item) this._layout()
    this.markDirty()
    return true
  }

  _font(size, weight = 500) {
    this.ctx.font = `${weight} ${size}px ${FONT}`
  }

  _measureWrapped(text, width, size, weight = 500) {
    const g = this.ctx
    this._font(size, weight)
    const out = []
    let line = ''
    for (const word of words(stripInline(text))) {
      // A URL or a long identifier must wrap too on a narrow reading column.
      if (g.measureText(word).width > width) {
        if (line) out.push(line)
        line = ''
        for (const character of word) {
          if (line && g.measureText(line + character).width > width) {
            out.push(line)
            line = ''
          }
          line += character
        }
        continue
      }
      const next = line ? `${line} ${word}` : word
      if (!line || g.measureText(next).width <= width) line = next
      else { out.push(line); line = word }
    }
    if (line) out.push(line)
    return out
  }

  _blockEnv() {
    return {
      rasteriser: this,
      item: this.item,
      images: this.images,
      colors: COLORS,
      columnWidth: this.columnWidth,
      loadImage: src => this._loadImage(src),
      drawLines: (...args) => this._drawLines(...args),
      wrap: (text, width, size, weight = 500) => this._measureWrapped(text, width, size, weight),
      markDirty: () => this.markDirty(),
    }
  }

  _layout() {
    this.layout = []
    const margin = this.width < SRC_W ? 20 : 42
    const width = Math.min(520, this.width - margin * 2)
    const x = (this.width - width) / 2
    this.columnWidth = width
    this.columnX = x
    let y = 34
    const push = (entry) => {
      this.layout.push({ x, width, ...entry, y })
      y += entry.height
    }

    push({ type: 'eyebrow', text: 'DOCUMENT / LOCAL ARCHIVE', height: 23 })
    const title = this._measureWrapped(this.item.label || '', width, 18, 700)
    push({ type: 'title', lines: title, height: Math.max(28, title.length * 21 + 7) })
    if (this.item.sub) {
      const sub = this._measureWrapped(this.item.sub, width, 9, 600)
      push({ type: 'sub', lines: sub, height: sub.length * 13 + 14 })
    }
    push({ type: 'rule', height: 24 })

    let videoIndex = 0
    const env = this._blockEnv()
    for (const block of this.item.blocks || []) {
      const handler = this.blockRegistry?.get(block.type)
      if (handler?.measure) {
        const measured = handler.measure(this.ctx, block, env) || {}
        push({ type: block.type, block, height: measured.height || 120, meta: measured.meta })
        handler.preload?.(block, env)
        continue
      }

      switch (block.type) {
        case 'heading': {
          const size = block.level >= 3 ? 11 : 13
          const lines = this._measureWrapped(block.text, width, size, 700)
          push({ type: 'heading', lines, size, height: 24 + lines.length * (size + 4) })
          break
        }
        case 'prose': {
          const lines = this._measureWrapped(block.text, width, 10, 500)
          push({ type: 'prose', lines, height: lines.length * 15 + 17 })
          break
        }
        case 'list': {
          const lines = []
          for (let i = 0; i < (block.items || []).length; i++) {
            const prefix = block.ordered ? `${i + 1}.` : '•'
            const wrapped = this._measureWrapped(block.items[i], width - 22, 10, 500)
            wrapped.forEach((line, j) => lines.push(`${j === 0 ? prefix : ' '} ${line}`))
          }
          push({ type: 'list', lines, height: lines.length * 15 + 15 })
          break
        }
        case 'code': {
          const raw = String(block.body || '').split('\n')
          this._font(8)
          const max = this.fullscreen ? Math.max(12, Math.floor((width - 18) / this.ctx.measureText('M').width)) : 47
          const lines = raw.flatMap(line => line.length ? line.match(new RegExp(`.{1,${max}}`, 'g')) : [''])
          push({ type: 'code', language: block.language || '', lines, height: 47 + lines.length * 13 })
          break
        }
        case 'image':
          push({ type: 'image', block, height: 220 })
          this._loadImage(block.src)
          break
        case 'video':
          push({ type: 'video', block, videoIndex: videoIndex++, height: Number(block.height) || 236 })
          break
        case 'embed':
          push({ type: 'embed', block, height: 150 })
          break
        case 'note': {
          const lines = this._measureWrapped(block.body || '', width - 22, 10, 500)
          push({ type: 'note', lines, height: lines.length * 15 + 28 })
          break
        }
        case 'figure': {
          const lines = String([block.cols, block.body].filter(Boolean).join('\n')).split('\n')
          push({ type: 'code', language: 'FIGURE', lines, height: 47 + lines.length * 13 })
          break
        }
      }
    }

    this.documentHeight = y + 42
    this.maxScroll = Math.max(0, this.documentHeight - this.readingHeight)
    this._syncVideos()
  }

  _loadImage(src) {
    if (!src || this.images.has(src)) return
    const image = new Image()
    this.images.set(src, image)
    image.onload = () => this.markDirty()
    image.onerror = () => this.markDirty()
    image.src = src
  }

  _syncVideos() {
    if (!this.reader) return
    this.videoNodes = [...this.reader.querySelectorAll('video')]
    for (const video of this.videoNodes) {
      if (video.dataset.rasterBound) continue
      video.dataset.rasterBound = 'true'
      const dirty = () => this.markDirty()
      video.addEventListener('play', dirty, { passive: true })
      video.addEventListener('pause', dirty, { passive: true })
      video.addEventListener('seeked', dirty, { passive: true })
      video.addEventListener('loadeddata', dirty, { passive: true })
    }
  }

  _syncScrollFromDOM() {
    if (!this.reader) return
    const domMax = Math.max(0, this.reader.scrollHeight - this.reader.clientHeight)
    const ratio = domMax > 0 ? this.reader.scrollTop / domMax : 0
    this.scroll = ratio * this.maxScroll
  }

  getVisibleInteractiveEntry() {
    let best = null
    let bestVisible = 0
    for (const entry of this.layout) {
      const handler = this.blockRegistry?.get(entry.type)
      const interactive = entry.type === 'image' || entry.type === 'video' || entry.type === 'embed' || Boolean(handler?.getInteraction)
      if (!interactive) continue
      const top = entry.y - this.scroll
      const bottom = top + entry.height
      const visible = Math.max(0, Math.min(bottom, this.readingHeight - 20) - Math.max(top, 20))
      if (visible > bestVisible) {
        bestVisible = visible
        best = entry
      }
    }
    return bestVisible >= 32 ? best : null
  }

  getInteraction(entry) {
    if (!entry) return null
    if (entry.type === 'image') {
      // Plain ::image blocks predate the rich media registry. Route them into
      // the same CRT inspector as ::media so articles and projects share the
      // exact same interaction contract instead of having two media systems.
      return {
        provider: 'media-single',
        block: {
          ...entry.block,
          label: entry.block.label || entry.block.alt || '',
          provider: 'media-single',
        },
        entry,
        inline: true,
        direct: true,
      }
    }
    if (entry.type === 'video') {
      return {
        provider: 'video',
        block: entry.block,
        entry,
        inline: true,
        direct: true,
      }
    }
    if (entry.type === 'embed') return { provider: entry.block.provider || 'iframe', block: entry.block, entry }
    const handler = this.blockRegistry?.get(entry.type)
    const descriptor = handler?.getInteraction?.(entry.block, entry, this._blockEnv())
    return descriptor ? { ...descriptor, entry } : null
  }

  _drawLines(lines, x, y, size, lineHeight, color, weight = 500) {
    const g = this.ctx
    this._font(size, weight)
    g.fillStyle = color
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], x, y + i * lineHeight)
  }

  _drawMediaFrame(entry, y, source) {
    const g = this.ctx
    const x = entry.x
    const maxW = entry.width
    const maxH = entry.height - 28

    if (source && (source.complete || source.readyState >= 2)) {
      const sw = source.videoWidth || source.naturalWidth || source.width || 1
      const sh = source.videoHeight || source.naturalHeight || source.height || 1
      const scale = Math.min(maxW / sw, maxH / sh)
      const dw = sw * scale
      const dh = sh * scale
      const dx = x + (maxW - dw) * .5
      const dy = y + (maxH - dh) * .5

      try { g.drawImage(source, dx, dy, dw, dh) } catch {}

      if (entry.type === 'video') {
        g.strokeStyle = COLORS.dim
        g.lineWidth = 1
        g.strokeRect(dx + .5, dy + .5, Math.max(0, dw - 1), Math.max(0, dh - 1))
        const playing = !source.paused && !source.ended

        if (!playing) {
          const buttonW = 68
          const buttonH = 30
          const bx = dx + (dw - buttonW) * .5
          const by = dy + (dh - buttonH) * .5
          g.fillStyle = 'rgba(1,8,4,.82)'
          g.fillRect(bx, by, buttonW, buttonH)
          g.strokeStyle = COLORS.mid
          g.strokeRect(bx + .5, by + .5, buttonW - 1, buttonH - 1)
          this._font(10, 700)
          g.fillStyle = COLORS.amber
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText('▶ PLAY', bx + buttonW * .5, by + buttonH * .5 + .5)
          g.textAlign = 'left'
          g.textBaseline = 'alphabetic'
        }

        this._drawLines(
          [playing ? 'PAUSE' : 'PLAY'],
          dx + 8,
          dy + dh - 9,
          7,
          9,
          playing ? COLORS.core : COLORS.amber,
          700,
        )
      }
      return
    }

    const placeholderW = Math.min(maxW, 190)
    const placeholderH = 48
    const px = x + (maxW - placeholderW) * .5
    const py = y + (maxH - placeholderH) * .5
    g.strokeStyle = COLORS.dim
    g.strokeRect(px + .5, py + .5, placeholderW - 1, placeholderH - 1)
    this._drawLines(['MEDIA LOADING...'], px + 12, py + 28, 9, 12, COLORS.dim, 600)
  }

  paint(force = false) {
    if (!this.item) return false

    const playing = this.videoNodes.some(video => !video.paused && !video.ended && video.readyState >= 2)
    if (!force && !this.dirty && !playing) return false

    const g = this.ctx
    g.save()
    g.setTransform(this.canvas.width / this.width, 0, 0, this.canvas.height / this.height, 0, 0)
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.fillStyle = COLORS.bg
    g.fillRect(0, 0, this.width, this.height)
    const glow = g.createRadialGradient(this.width * .43, this.height * .35, 8, this.width * .5, this.height * .5, this.fullscreen ? Math.max(this.width, this.height) * .7 : SRC_W * .62)
    glow.addColorStop(0, COLORS.glowInner)
    glow.addColorStop(1, COLORS.glowOuter)
    g.fillStyle = glow
    g.fillRect(0, 0, this.width, this.height)

    g.save()
    g.beginPath()
    // The chapter footer has its own band; content must stop above its glyphs.
    g.rect(Math.max(8, this.columnX - 16), 20, this.columnWidth + 32, this.readingHeight - (this.fullscreen ? 52 : 40))
    g.clip()

    const env = this._blockEnv()
    for (const entry of this.layout) {
      const y = entry.y - this.scroll
      if (y + entry.height < 14 || y > this.readingHeight - 8) continue
      const x = entry.x

      const handler = this.blockRegistry?.get(entry.type)
      if (handler?.paint) {
        handler.paint(g, entry.block, { ...entry, y }, env)
        continue
      }

      switch (entry.type) {
        case 'eyebrow':
          this._drawLines([entry.text], x, y + 9, 8, 11, COLORS.mid, 700)
          break
        case 'title':
          this._drawLines(entry.lines, x, y + 16, 18, 21, COLORS.core, 700)
          break
        case 'sub':
          this._drawLines(entry.lines, x, y + 9, 9, 13, COLORS.mid, 600)
          break
        case 'rule':
          g.strokeStyle = COLORS.dim
          g.beginPath(); g.moveTo(x, y + 8.5); g.lineTo(x + entry.width, y + 8.5); g.stroke()
          break
        case 'heading':
          this._drawLines(entry.lines, x, y + 17, entry.size, entry.size + 4, COLORS.bright, 700)
          break
        case 'prose':
        case 'list':
          this._drawLines(entry.lines, x, y + 10, 10, 15, COLORS.bright, 500)
          break
        case 'code': {
          const h = entry.height - 9
          g.fillStyle = COLORS.panel; g.fillRect(x, y, entry.width, h)
          g.strokeStyle = COLORS.dim; g.strokeRect(x + .5, y + .5, entry.width - 1, h - 1)
          if (entry.language) {
            this._drawLines([entry.language.toUpperCase()], x + 9, y + 13, 7, 9, COLORS.amber, 700)
            g.strokeStyle = COLORS.dim; g.beginPath(); g.moveTo(x, y + 21.5); g.lineTo(x + entry.width, y + 21.5); g.stroke()
          }
          this._drawLines(entry.lines, x + 9, y + 37, 8, 13, COLORS.bright, 500)
          break
        }
        case 'image':
          this._drawMediaFrame(entry, y, this.images.get(entry.block.src))
          break
        case 'video':
          this._drawMediaFrame(entry, y, this.videoNodes[entry.videoIndex])
          break
        case 'embed': {
          g.fillStyle = COLORS.panel; g.fillRect(x, y, entry.width, entry.height - 10)
          g.strokeStyle = COLORS.dim; g.strokeRect(x + .5, y + .5, entry.width - 1, entry.height - 11)
          this._drawLines(['EXTERNAL / INTERACTIVE SURFACE', entry.block.label || entry.block.title || 'OPEN EMBED'], x + 12, y + 28, 9, 18, COLORS.amber, 700)
          this._drawLines(['Use INTERACT when this block is visible.'], x + 12, y + 70, 8, 12, COLORS.mid, 500)
          break
        }
        case 'note': {
          g.fillStyle = 'rgba(255,179,71,.07)'; g.fillRect(x, y, entry.width, entry.height - 8)
          g.strokeStyle = 'rgba(255,179,71,.42)'; g.strokeRect(x + .5, y + .5, entry.width - 1, entry.height - 9)
          this._drawLines(entry.lines, x + 11, y + 16, 10, 15, COLORS.amber, 600)
          break
        }
      }
    }

    g.restore()
    g.restore()
    this.dirty = false
    return true
  }
}
