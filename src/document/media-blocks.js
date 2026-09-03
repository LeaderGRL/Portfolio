import { drawCoverImage, parsePipeRows } from './default-blocks.js'

function imageFrom(env, src) {
  if (!src) return null
  if (!env.images.has(src)) env.loadImage(src)
  return env.images.get(src) || null
}

function isContain(fit) {
  return String(fit || '').toLowerCase() === 'contain'
}

function drawContainedImageWithRect(g, image, x, y, width, height) {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const dw = image.naturalWidth * scale
  const dh = image.naturalHeight * scale
  const dx = x + (width - dw) * 0.5
  const dy = y + (height - dh) * 0.5
  g.drawImage(image, dx, dy, dw, dh)
  return { x: dx, y: dy, width: dw, height: dh }
}

function drawByFit(g, image, x, y, width, height, fit) {
  if (isContain(fit)) {
    return drawContainedImageWithRect(g, image, x, y, width, height)
  }
  return drawCoverImage(g, image, x, y, width, height)
    ? { x, y, width, height }
    : null
}

function captionTopFor(paintedRect, fallbackTop, fit) {
  if (!paintedRect || !isContain(fit)) return fallbackTop
  return Math.min(fallbackTop, paintedRect.y + paintedRect.height)
}

function clampHeight(value, fallback = 246) {
  const height = Number(value) || fallback
  return Math.max(150, Math.min(340, height))
}

function mediaGap(block) {
  const value = Number(block.gap)
  if (Number.isFinite(value)) return Math.max(12, Math.min(48, value))
  return 14
}

function hasPanelBackground(block) {
  const value = String(block?.background ?? 'on').toLowerCase()
  return !['off', 'false', 'none', 'transparent', '0'].includes(value)
}

function paintPanel(g, x, y, width, height, enabled = true, color = '#020d07') {
  if (!enabled) return
  g.fillStyle = color
  g.fillRect(x, y, width, height)
}

export function enhanceMediaBlocks(registry) {
  registry.register('media', {
    measure(_ctx, block, env) {
      const base = clampHeight(block.height)
      const footer = block.label ? 23 : 0
      // Keep the editorial frame proportional when the reading column narrows,
      // rather than centring a tiny landscape image inside a tall empty box.
      const scale = env?.rasteriser?.fullscreen ? Math.min(1, env.columnWidth / 396) : 1
      const visualHeight = footer + (base - footer) * scale
      const gap = mediaGap(block)
      return { height: visualHeight + gap, meta: { visualHeight, gap } }
    },
    // Large editorial media is loaded on first visible paint rather than while
    // laying out the complete document. This keeps deep project pages cheap.
    preload() {},
    paint(g, block, layout, env) {
      const visualHeight = layout.meta?.visualHeight || clampHeight(block.height)
      const hasLabel = Boolean(block.label)
      const footerH = hasLabel ? 23 : 0
      const mediaH = Math.max(1, visualHeight - footerH)
      const panel = hasPanelBackground(block)
      const fit = block.fit || 'cover'

      paintPanel(g, layout.x, layout.y, layout.width, visualHeight, panel, '#020d07')

      const painted = drawByFit(
        g,
        imageFrom(env, block.src),
        layout.x,
        layout.y,
        layout.width,
        mediaH,
        fit,
      )

      if (!painted) {
        env.drawLines(
          ['LOADING PROJECT MEDIA...'],
          layout.x + 14,
          layout.y + mediaH * 0.5,
          9,
          12,
          env.colors.mid,
          700,
        )
      }

      if (hasLabel) {
        const captionTop = captionTopFor(painted, layout.y + mediaH, fit)
        if (panel) {
          g.fillStyle = 'rgba(1,10,5,.86)'
          g.fillRect(layout.x, captionTop, layout.width, footerH)
        }
        env.drawLines(
          env.wrap(block.label, layout.width - 14, 7, 600).slice(0, 2),
          layout.x + 7,
          captionTop + 14,
          7,
          9,
          env.colors.mid,
          600,
        )
      }
    },
    getInteraction(block) {
      return {
        provider: 'media-single',
        block: { ...block, provider: 'media-single' },
        inline: true,
        direct: true,
      }
    },
  })

  const galleryBase = registry.require('gallery')
  registry.register('gallery', {
    ...galleryBase,
    preload() {},
    paint(g, block, layout, env) {
      const items = layout.meta?.items || parsePipeRows(block.body)
      const columns = layout.meta?.columns || 2
      const gap = 9
      const cellW = (layout.width - gap * (columns - 1)) / columns
      const cellH = 136
      const fit = block.fit || 'cover'
      const panel = hasPanelBackground(block)

      items.forEach((item, index) => {
        const col = index % columns
        const row = Math.floor(index / columns)
        const x = layout.x + col * (cellW + gap)
        const y = layout.y + row * 146
        const mediaH = cellH - 23

        paintPanel(g, x, y, cellW, cellH, panel, '#020d07')
        const painted = drawByFit(g, imageFrom(env, item.value), x, y, cellW, mediaH, fit)

        if (item.label) {
          const captionTop = captionTopFor(painted, y + mediaH, fit)
          if (panel) {
            g.fillStyle = 'rgba(1,10,5,.86)'
            g.fillRect(x, captionTop, cellW, 23)
          }
          env.drawLines(
            env.wrap(item.label, cellW - 10, 7, 600).slice(0, 2),
            x + 6,
            captionTop + 12,
            7,
            9,
            env.colors.mid,
            600,
          )
        }
      })
    },
    getInteraction(block) {
      return {
        provider: 'media-gallery',
        block: { ...block, provider: 'media-gallery' },
        inline: true,
        direct: true,
      }
    },
  })

  const compareBase = registry.require('compare')
  registry.register('compare', {
    ...compareBase,
    preload() {},
    paint(g, block, layout, env) {
      const gap = 8
      const half = (layout.width - gap) / 2
      const mediaH = layout.height - 34
      const fit = block.fit || 'cover'
      const panel = hasPanelBackground(block)
      const entries = [
        [block.before, block.beforeLabel || 'BEFORE'],
        [block.after, block.afterLabel || 'AFTER'],
      ]

      entries.forEach(([src, label], index) => {
        const x = layout.x + index * (half + gap)
        paintPanel(g, x, layout.y, half, mediaH, panel, '#020c06')
        drawByFit(g, imageFrom(env, src), x, layout.y, half, mediaH, fit)
        if (panel) {
          g.fillStyle = 'rgba(1,9,5,.78)'
          g.fillRect(x, layout.y + mediaH - 20, half, 20)
        }
        env.drawLines(
          [String(label).toUpperCase()],
          x + 7,
          layout.y + mediaH - 7,
          7,
          9,
          index ? env.colors.core : env.colors.dim,
          700,
        )
      })
    },
    getInteraction(block) {
      return {
        provider: 'media-compare',
        block: { ...block, provider: 'media-compare' },
        inline: true,
        direct: true,
      }
    },
  })

  return registry
}
