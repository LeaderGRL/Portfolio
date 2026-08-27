/* ========================================================================== *
 * Local 3D fallback block enhancer
 *
 * A model block is optional content. When WebGL2 or the model asset is not
 * available, keep the document usable and paint its authored poster through
 * the same article-source -> CRT pipeline.
 * ========================================================================== */

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

export function enhanceModel3DFallback(registry, local3d) {
  const base = registry.require('model3d')

  registry.register('model3d', {
    ...base,
    preload(block, env) {
      base.preload?.(block, env)
      if (block.poster) env.loadImage(block.poster)
    },
    paint(g, block, layout, env) {
      if (!local3d.hasFailed(block)) {
        base.paint?.(g, block, layout, env)
        return
      }

      const h = layout.height - 28
      const poster = block.poster ? env.images.get(block.poster) : null
      g.fillStyle = '#020d07'
      g.fillRect(layout.x, layout.y, layout.width, h)

      const painted = drawContainedImage(g, poster, layout.x, layout.y, layout.width, h)
      if (!painted) {
        env.drawLines(['3D MODEL UNAVAILABLE'], layout.x + 14, layout.y + h * 0.5, 9, 12, env.colors.amber, 700)
      }

      g.fillStyle = 'rgba(1,10,5,.78)'
      g.fillRect(layout.x, layout.y + h - 23, layout.width, 23)
      env.drawLines([String(block.label || block.title || '3D MODEL').toUpperCase()], layout.x + 8, layout.y + h - 9, 7, 9, env.colors.core, 700)
      env.drawLines(['STATIC FALLBACK'], layout.x + layout.width - 92, layout.y + h - 9, 7, 9, env.colors.amber, 700)
    },
    getInteraction(block, layout, env) {
      if (local3d.hasFailed(block)) return null
      return base.getInteraction?.(block, layout, env) || null
    },
  })

  return registry
}
