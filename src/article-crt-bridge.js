import { ArticleRasteriser } from './article-rasteriser.js'

/* ========================================================================== *
 * ArticleCRTBridge
 *
 * Adapts the existing App without creating a second tube. App still owns the
 * animation loop, power state and CRT instance. This bridge only changes which
 * 480x360 canvas `CRT.source` points at and which rasteriser paints when the
 * current route is an article detail.
 *
 * This is deliberately a narrow adapter. A later generalized display-source
 * registry can replace it without touching article layout or the CRT shader.
 * ========================================================================== */
export function attachArticleCRT(app) {
  if (!app || app.__articleCRTBridge) return app?.__articleCRTBridge || null

  const tube = document.getElementById('tube')
  const reader = document.getElementById('article-reader')
  const articleCanvas = document.getElementById('article-source')
  if (!tube || !reader || !articleCanvas || !app.crt || !app.raster) return null

  const terminalCanvas = app.raster.canvas
  const terminalPaint = app.raster.paint.bind(app.raster)
  const articleRaster = new ArticleRasteriser(articleCanvas, reader, () => {
    app.dirty = true
  })

  const clearPersistence = () => {
    const crt = app.crt
    const gl = crt.gl
    if (!gl || !crt.a || !crt.b) return
    const previous = gl.getParameter?.(gl.FRAMEBUFFER_BINDING)
    gl.clearColor(0, 0, 0, 1)
    for (const target of [crt.a, crt.b]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb)
      gl.viewport(0, 0, 480, 360)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, previous || null)
  }

  const isArticle = () => app.state?.route === 'articles' && Boolean(app.state?.item)

  const syncSource = () => {
    const article = isArticle() ? app.state.item : null
    articleRaster.setItem(article)
    const nextSource = article ? articleCanvas : terminalCanvas
    if (app.crt.source !== nextSource) {
      app.crt.source = nextSource
      clearPersistence()
      app.dirty = true
      app.state.static = Math.max(app.state.static || 0, 0.7)
    }
    tube.dataset.displayMode = article ? 'article' : 'terminal'
    tube.classList.toggle('has-dom-surface', Boolean(article))
  }

  // App calls this whenever its source image is dirty. In article mode the
  // same call now paints the authored article into the CRT source canvas.
  app.raster.paint = (term, reveal, cursorOn) => {
    syncSource()
    if (isArticle()) return articleRaster.paint(true)
    return terminalPaint(term, reveal, cursorOn)
  }

  const originalRender = app.render.bind(app)
  app.render = (...args) => {
    const result = originalRender(...args)
    syncSource()
    return result
  }

  // Native video needs fresh source pixels while playing. We do not force the
  // whole application to redraw continuously for static articles.
  let raf = 0
  const mediaFrame = () => {
    raf = requestAnimationFrame(mediaFrame)
    if (!isArticle()) return
    if (articleRaster.videoNodes.some(video => !video.paused && !video.ended && video.readyState >= 2)) {
      app.dirty = true
    }
  }
  raf = requestAnimationFrame(mediaFrame)

  syncSource()

  const bridge = {
    articleRaster,
    syncSource,
    destroy() {
      cancelAnimationFrame(raf)
      app.raster.paint = terminalPaint
      app.crt.source = terminalCanvas
      tube.dataset.displayMode = 'terminal'
      tube.classList.remove('has-dom-surface')
      delete app.__articleCRTBridge
    },
  }
  app.__articleCRTBridge = bridge
  return bridge
}
