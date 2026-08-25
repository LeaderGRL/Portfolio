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

export function enhanceMediaBlocks(registry) {
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
