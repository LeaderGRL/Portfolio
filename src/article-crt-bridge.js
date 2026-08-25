import { ArticleRasteriser } from './article-rasteriser.js'
import { DisplayPipeline } from './display-pipeline.js'

/* ========================================================================== *
 * ArticleCRTBridge
 *
 * Adapts the existing App without creating a second tube. App still owns the
 * animation loop, power state and CRT instance. This bridge only changes which
 * registered 480x360 pixel source the physical CRT samples.
 * ========================================================================== */
export function attachArticleCRT(app) {
  if (!app || app.__articleCRTBridge) return app?.__articleCRTBridge || null

  const tube = document.getElementById('tube')
  const reader = document.getElementById('article-reader')
  const articleCanvas = document.getElementById('article-source')
  if (!tube || !reader || !articleCanvas || !app.crt || !app.raster) return null

  const terminalCanvas = app.raster.canvas
  const terminalPaint = app.raster.paint.bind(app.raster)
  const pipeline = new DisplayPipeline({
    crt: app.crt,
    sources: {
      terminal: terminalCanvas,
      article: articleCanvas,
    },
  })

  const articleRaster = new ArticleRasteriser(articleCanvas, reader, () => {
    app.dirty = true
  })

  const isArticle = () => app.state?.route === 'articles' && Boolean(app.state?.item)

  const syncSource = () => {
    const article = isArticle() ? app.state.item : null
    articleRaster.setItem(article)
    const nextId = article ? 'article' : 'terminal'
    if (pipeline.setSource(nextId)) {
      app.dirty = true
      app.state.static = Math.max(app.state.static || 0, 0.7)
    }
    tube.dataset.displayMode = nextId
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

  // Native video needs fresh source pixels while playing. Static articles do
  // not force a continuous source upload.
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
    pipeline,
    syncSource,
    registerSource: (id, source) => pipeline.registerSource(id, source),
    setSource: id => pipeline.setSource(id),
    enterFullscreen: () => pipeline.enterFullscreen(document.getElementById('screen')),
    exitFullscreen: () => pipeline.exitFullscreen(),
    destroy() {
      cancelAnimationFrame(raf)
      app.raster.paint = terminalPaint
      pipeline.setSource('terminal')
      tube.dataset.displayMode = 'terminal'
      tube.classList.remove('has-dom-surface')
      delete app.__articleCRTBridge
    },
  }
  app.__articleCRTBridge = bridge
  app.displayPipeline = pipeline
  return bridge
}
