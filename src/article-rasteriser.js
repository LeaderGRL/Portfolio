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
      loadImage: src => this._loadImage(src),
      drawLines: (...args) => this._drawLines(...args),
      wrap: (text, width, size, weight = 500) => this._measureWrapped(text, width, size, weight),
      markDirty: () => this.markDirty(),
    }
  }

  _layout() {
    const x = 42
    const width = SRC_W - x * 2
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
          const max = 47
          const lines = raw.flatMap(line => line.length ? line.match(new RegExp(`.{1,${max}}`, 'g')) : [''])
          push({ type: 'code', language: block.language || '', lines, height: 47 + lines.length * 13 })
          break
        }
        case 'image':
          push({ type: 'image', block, height: 220 })
          this._loadImage(block.src)
          break
        case 'video':
          push({ type: 'video', block, videoIndex: videoIndex++, height: 220 })
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
    this.maxScroll = Math.max(0, this.documentHeight - SRC_H)
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
      const interactive = entry.type === 'video' || entry.type === 'embed' || Boolean(handler?.getInteraction)
      if (!interactive) continue
      const top = entry.y - this.scroll
      const bottom = top + entry.height
      const visible = Math.max(0, Math.min(bottom, SRC_H - 20) - Math.max(top, 20))
      if (visible > bestVisible) {
        bestVisible = visible
        best = entry
      }
    }
    return bestVisible >= 32 ? best : null
  }

  getInteraction(entry) {
    if (!entry) return null
    if (entry.type === 'video') return { provider: 'video', block: entry.block, entry }
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
    const maxH = entry.height - 24

    if (source && (source.complete || source.readyState >= 2)) {
      const sw = source.videoWidth || source.naturalWidth || source.width || 1
      const sh = source.videoHeight || source.naturalHeight || source.height || 1
      const scale = Math.min(maxW / sw, maxH / sh)
      const dw = sw * scale
      const dh = sh * scale
      const dx = x + (maxW - dw) * .5
      const dy = y + (maxH - dh) * .5

      if (entry.type === 'video') {
        g.fillStyle = '#010805'
        g.fillRect(dx, dy, dw, dh)
      }

      try { g.drawImage(source, dx, dy, dw, dh) } catch {}

      if (entry.type === 'video') {
        g.strokeStyle = COLORS.dim
        g.lineWidth = 1
        g.strokeRect(dx + .5, dy + .5, Math.max(0, dw - 1), Math.max(0, dh - 1))
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
    g.fillStyle = COLORS.bg
    g.fillRect(0, 0, SRC_W, SRC_H)
    const glow = g.createRadialGradient(SRC_W * .43, SRC_H * .35, 8, SRC_W * .5, SRC_H * .5, SRC_W * .62)
    glow.addColorStop(0, COLORS.glowInner)
    glow.addColorStop(1, COLORS.glowOuter)
    g.fillStyle = glow
    g.fillRect(0, 0, SRC_W, SRC_H)

    g.save()
    g.beginPath()
    g.rect(26, 20, SRC_W - 52, SRC_H - 40)
    g.clip()

    const env = this._blockEnv()
    for (const entry of this.layout) {
      const y = entry.y - this.scroll
      if (y + entry.height < 14 || y > SRC_H - 8) continue
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
          g.fillStyle = COLORS.amber; g.fillRect(x, y, 2, entry.height - 8)
          this._drawLines(entry.lines, x + 12, y + 16, 9, 15, COLORS.bright, 500)
          break
        }
      }
    }

    g.restore()
    this.dirty = false
    return true
  }
}
