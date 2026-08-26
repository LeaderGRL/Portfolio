import { drawContainedImage, drawCoverImage, parsePipeRows } from './default-blocks.js'

function imageFrom(env, src) {
  return src ? env.images.get(src) : null
}

function drawByFit(g, image, x, y, width, height, fit) {
  if (String(fit || '').toLowerCase() === 'contain') {
    return drawContainedImage(g, image, x, y, width, height)
  }
  return drawCoverImage(g, image, x, y, width, height)
}

function clampHeight(value, fallback = 246) {
  const height = Number(value) || fallback
  return Math.max(150, Math.min(340, height))
}

export function enhanceMediaBlocks(registry) {
  registry.register('media', {
    measure(_ctx, block) {
      return { height: clampHeight(block.height) }
    },
    preload(block, env) {
      if (block.src) env.loadImage(block.src)
    },
    paint(g, block, layout, env) {
      const hasLabel = Boolean(block.label)
      const footerH = hasLabel ? 23 : 0
      const mediaH = layout.height - footerH

      g.fillStyle = '#020d07'
      g.fillRect(layout.x, layout.y, layout.width, layout.height)
      const painted = drawByFit(
        g,
        imageFrom(env, block.src),
        layout.x,
        layout.y,
        layout.width,
        mediaH,
        block.fit || 'cover',
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
        g.fillStyle = 'rgba(1,10,5,.86)'
        g.fillRect(layout.x, layout.y + mediaH, layout.width, footerH)
        env.drawLines(
          env.wrap(block.label, layout.width - 14, 7, 600).slice(0, 2),
          layout.x + 7,
          layout.y + layout.height - 9,
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
    paint(g, block, layout, env) {
      const items = layout.meta?.items || parsePipeRows(block.body)
      const columns = layout.meta?.columns || 2
      const gap = 9
      const cellW = (layout.width - gap * (columns - 1)) / columns
      const cellH = 136
      const fit = block.fit || 'cover'

      items.forEach((item, index) => {
        const col = index % columns
        const row = Math.floor(index / columns)
        const x = layout.x + col * (cellW + gap)
        const y = layout.y + row * 146
        const mediaH = cellH - 23
        g.fillStyle = '#020d07'
        g.fillRect(x, y, cellW, cellH)
        drawByFit(g, imageFrom(env, item.value), x, y, cellW, mediaH, fit)
        if (item.label) {
          g.fillStyle = 'rgba(1,10,5,.86)'
          g.fillRect(x, y + mediaH, cellW, 23)
          env.drawLines(env.wrap(item.label, cellW - 10, 7, 600).slice(0, 2), x + 6, y + cellH - 11, 7, 9, env.colors.mid, 600)
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
    paint(g, block, layout, env) {
      const gap = 8
      const half = (layout.width - gap) / 2
      const mediaH = layout.height - 34
      const fit = block.fit || 'cover'
      const entries = [
        [block.before, block.beforeLabel || 'BEFORE'],
        [block.after, block.afterLabel || 'AFTER'],
      ]

      entries.forEach(([src, label], index) => {
        const x = layout.x + index * (half + gap)
        g.fillStyle = '#020c06'
        g.fillRect(x, layout.y, half, mediaH)
        drawByFit(g, imageFrom(env, src), x, layout.y, half, mediaH, fit)
        g.fillStyle = 'rgba(1,9,5,.78)'
        g.fillRect(x, layout.y + mediaH - 20, half, 20)
        env.drawLines([String(label).toUpperCase()], x + 7, layout.y + mediaH - 7, 7, 9, index ? env.colors.core : env.colors.dim, 700)
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
