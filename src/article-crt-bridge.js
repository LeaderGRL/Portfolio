import { ArticleInteractionController } from './article-interaction.js'
import { ArticleRasteriser } from './article-rasteriser.js'
import { DisplayPipeline } from './display-pipeline.js'

/* ========================================================================== *
 * ArticleCRTBridge
 *
 * Adapts the existing App without creating a second tube. App still owns the
 * animation loop, power state and CRT instance. This bridge switches between
 * the terminal and article 480x360 pixel sources and coordinates the explicit
 * native interaction surface used by video controls and external embeds.
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

  let interaction = null
  const articleRaster = new ArticleRasteriser(articleCanvas, reader, () => {
    app.dirty = true
    interaction?.sync()
  })
  interaction = new ArticleInteractionController({ tube, reader, rasteriser: articleRaster })

  const isArticle = () => app.state?.route === 'articles' && Boolean(app.state?.item)

  const syncSource = () => {
    const article = isArticle() ? app.state.item : null
    const itemChanged = articleRaster.setItem(article)
    if (itemChanged && interaction.isOpen) interaction.close(false)

    const nextId = article ? 'article' : 'terminal'
    if (pipeline.setSource(nextId)) {
      app.dirty = true
      app.state.static = Math.max(app.state.static || 0, 0.7)
    }

    tube.dataset.displayMode = nextId
    tube.classList.toggle('has-dom-surface', Boolean(article))
    if (!article && interaction.isOpen) interaction.close(false)
    interaction.sync()
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
  // not force a continuous source upload. The interaction affordance is also
  // synced here so smooth DOM scrolling updates it without waiting for a route
  // render.
  let raf = 0
  const mediaFrame = () => {
    raf = requestAnimationFrame(mediaFrame)
    if (!isArticle()) return
    interaction.sync()
    if (articleRaster.videoNodes.some(video => !video.paused && !video.ended && video.readyState >= 2)) {
      app.dirty = true
    }
  }
  raf = requestAnimationFrame(mediaFrame)

  syncSource()

  const bridge = {
    articleRaster,
    interaction,
    pipeline,
    syncSource,
    enterFullscreen: () => pipeline.enterFullscreen(document.getElementById('screen')),
    exitFullscreen: () => pipeline.exitFullscreen(),
    destroy() {
      cancelAnimationFrame(raf)
      interaction.destroy()
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
