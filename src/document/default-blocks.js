import { BlockRegistry } from './block-registry.js'

const splitRows = body => String(body || '')
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)

const parsePipeRows = body => splitRows(body).map(line => {
  const [first, ...rest] = line.split('|').map(part => part.trim())
  return { value: first, label: rest.join(' | ') }
})

function drawContainedImage(g, image, x, y, width, height) {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return false
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const dw = image.naturalWidth * scale
  const dh = image.naturalHeight * scale
  const dx = x + (width - dw) * 0.5
  const dy = y + (height - dh) * 0.5
  g.drawImage(image, dx, dy, dw, dh)
  return true
}

function drawCoverImage(g, image, x, y, width, height) {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return false
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const dw = image.naturalWidth * scale
  const dh = image.naturalHeight * scale
  const dx = x + (width - dw) * 0.5
  const dy = y + (height - dh) * 0.5
  g.save()
  g.beginPath()
  g.rect(x, y, width, height)
  g.clip()
  g.drawImage(image, dx, dy, dw, dh)
  g.restore()
  return true
}

function imageFrom(env, src) {
  return src ? env.images.get(src) : null
}

function preloadAsset(env, src) {
  if (src) env.loadImage(src)
}

export function createDefaultBlockRegistry({ local3d }) {
  const registry = new BlockRegistry()

  registry.register('hero', {
    measure(_ctx, block) {
      return { height: Number(block.height) || 242 }
    },
    preload(block, env) {
      preloadAsset(env, block.media || block.poster)
    },
    paint(g, block, layout, env) {
      const media = imageFrom(env, block.media || block.poster)
      const h = layout.height - 18
      const painted = drawCoverImage(g, media, layout.x, layout.y, layout.width, h)
      if (!painted) {
        g.fillStyle = '#04170d'
        g.fillRect(layout.x, layout.y, layout.width, h)
      }

      const gradient = g.createLinearGradient(0, layout.y, 0, layout.y + h)
      gradient.addColorStop(0, 'rgba(0,8,4,.08)')
      gradient.addColorStop(.58, 'rgba(0,8,4,.24)')
      gradient.addColorStop(1, 'rgba(0,8,4,.90)')
      g.fillStyle = gradient
      g.fillRect(layout.x, layout.y, layout.width, h)

      const eyebrow = block.eyebrow || block.kicker || ''
      if (eyebrow) env.drawLines([String(eyebrow).toUpperCase()], layout.x + 14, layout.y + 24, 8, 11, env.colors.amber, 700)
      const title = block.title || env.item?.label || ''
      const titleLines = env.wrap(String(title).toUpperCase(), layout.width - 28, 17, 700)
      env.drawLines(titleLines, layout.x + 14, layout.y + h - 42 - (titleLines.length - 1) * 19, 17, 19, env.colors.core, 700)
      if (block.subtitle) env.drawLines(env.wrap(block.subtitle, layout.width - 28, 8, 600), layout.x + 14, layout.y + h - 16, 8, 10, env.colors.mid, 600)
    },
  })

  registry.register('gallery', {
    measure(_ctx, block) {
      const items = parsePipeRows(block.body)
      const columns = Math.max(1, Math.min(3, Number(block.columns) || 2))
      const rows = Math.max(1, Math.ceil(items.length / columns))
      return { height: rows * 146 + 20, meta: { items, columns } }
    },
    preload(block, env) {
      for (const item of parsePipeRows(block.body)) preloadAsset(env, item.value)
    },
    paint(g, block, layout, env) {
      const items = layout.meta?.items || parsePipeRows(block.body)
      const columns = layout.meta?.columns || 2
      const gap = 9
      const cellW = (layout.width - gap * (columns - 1)) / columns
      const cellH = 136

      items.forEach((item, index) => {
        const col = index % columns
        const row = Math.floor(index / columns)
        const x = layout.x + col * (cellW + gap)
        const y = layout.y + row * 146
        g.fillStyle = '#020d07'
        g.fillRect(x, y, cellW, cellH)
        const image = imageFrom(env, item.value)
        drawCoverImage(g, image, x, y, cellW, cellH - 23)
        if (item.label) {
          g.fillStyle = 'rgba(1,10,5,.86)'
          g.fillRect(x, y + cellH - 23, cellW, 23)
          env.drawLines(env.wrap(item.label, cellW - 10, 7, 600).slice(0, 2), x + 6, y + cellH - 11, 7, 9, env.colors.mid, 600)
        }
      })
    },
  })

  registry.register('timeline', {
    measure(_ctx, block) {
      const items = parsePipeRows(block.body)
      return { height: Math.max(82, items.length * 34 + 22), meta: { items } }
    },
    paint(g, block, layout, env) {
      const items = layout.meta?.items || parsePipeRows(block.body)
      const lineX = layout.x + 78
      g.strokeStyle = env.colors.dim
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(lineX + .5, layout.y + 8)
      g.lineTo(lineX + .5, layout.y + Math.max(12, items.length * 34 - 8))
      g.stroke()

      items.forEach((item, index) => {
        const y = layout.y + 18 + index * 34
        env.drawLines([item.value], layout.x, y, 8, 10, env.colors.amber, 700)
        g.fillStyle = index === 0 ? env.colors.core : env.colors.mid
        g.fillRect(lineX - 2, y - 5, 5, 5)
        const label = env.wrap(item.label || '', layout.width - 98, 9, 600)
        env.drawLines(label.slice(0, 2), lineX + 14, y, 9, 11, env.colors.bright, 600)
      })
    },
  })

  registry.register('compare', {
    measure() {
      return { height: 224 }
    },
    preload(block, env) {
      preloadAsset(env, block.before)
      preloadAsset(env, block.after)
    },
    paint(g, block, layout, env) {
      const gap = 8
      const half = (layout.width - gap) / 2
      const mediaH = layout.height - 34
      const entries = [
        [block.before, block.beforeLabel || 'BEFORE'],
        [block.after, block.afterLabel || 'AFTER'],
      ]
      entries.forEach(([src, label], index) => {
        const x = layout.x + index * (half + gap)
        g.fillStyle = '#020c06'
        g.fillRect(x, layout.y, half, mediaH)
        drawCoverImage(g, imageFrom(env, src), x, layout.y, half, mediaH)
        g.fillStyle = 'rgba(1,9,5,.78)'
        g.fillRect(x, layout.y + mediaH - 20, half, 20)
        env.drawLines([String(label).toUpperCase()], x + 7, layout.y + mediaH - 7, 7, 9, index ? env.colors.core : env.colors.dim, 700)
      })
    },
  })

  registry.register('model3d', {
    measure() {
      return { height: 248 }
    },
    preload(block) {
      local3d.ensure(block)
    },
    paint(g, block, layout, env) {
      const h = layout.height - 28
      g.fillStyle = '#010a05'
      g.fillRect(layout.x, layout.y, layout.width, h)

      const canvas = local3d.getCanvas(block)
      if (local3d.isReady(block) && canvas) {
        g.save()
        g.beginPath()
        g.rect(layout.x, layout.y, layout.width, h)
        g.clip()
        g.drawImage(canvas, layout.x, layout.y, layout.width, h)
        g.restore()
      } else if (local3d.hasFailed(block)) {
        env.drawLines(['3D MODEL UNAVAILABLE'], layout.x + 14, layout.y + h * .5, 9, 12, env.colors.amber, 700)
      } else {
        env.drawLines(['LOADING 3D ASSET...'], layout.x + 14, layout.y + h * .5, 9, 12, env.colors.mid, 700)
      }

      g.fillStyle = 'rgba(1,10,5,.72)'
      g.fillRect(layout.x, layout.y + h - 23, layout.width, 23)
      env.drawLines([String(block.label || block.title || 'INTERACTIVE 3D MODEL').toUpperCase()], layout.x + 8, layout.y + h - 9, 7, 9, env.colors.core, 700)
      env.drawLines(['DRAG / ZOOM'], layout.x + layout.width - 72, layout.y + h - 9, 7, 9, env.colors.amber, 700)
    },
    getInteraction(block) {
      return { provider: 'local-3d', block }
    },
  })

  return registry
}

export { drawContainedImage, drawCoverImage, parsePipeRows }
