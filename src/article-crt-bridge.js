import { ArticleInteractionController } from './article-interaction.js'
import { syncArticleReader } from './article-reader.js'
import { ArticleRasteriser } from './article-rasteriser.js'
import { DisplayPipeline } from './display-pipeline.js'

/* ========================================================================== *
 * Document CRT bridge
 *
 * Historical file/class names are retained temporarily to minimize migration
 * risk, but the bridge now serves every long-form document detail (articles
 * and projects). Both kinds use the same 480x360 source, CRT shader, scrolling
 * and native interaction surface.
 * ========================================================================== */
export function attachArticleCRT(app) {
  if (!app || app.__articleCRTBridge) return app?.__articleCRTBridge || null

  const tube = document.getElementById('tube')
  const reader = document.getElementById('article-reader')
  const documentCanvas = document.getElementById('article-source')
  if (!tube || !reader || !documentCanvas || !app.crt || !app.raster) return null

  const terminalCanvas = app.raster.canvas
  const terminalPaint = app.raster.paint.bind(app.raster)
  const pipeline = new DisplayPipeline({
    crt: app.crt,
    sources: {
      terminal: terminalCanvas,
      document: documentCanvas,
    },
  })

  let interaction = null
  const documentRaster = new ArticleRasteriser(documentCanvas, reader, () => {
    app.dirty = true
    interaction?.sync()
  })
  interaction = new ArticleInteractionController({ tube, reader, rasteriser: documentRaster })

  const isDocument = () => (
    (app.state?.route === 'articles' || app.state?.route === 'projects') &&
    Boolean(app.state?.item)
  )

  const syncSource = () => {
    const documentItem = isDocument() ? app.state.item : null

    // App still owns the legacy article-reader synchronization for articles.
    // Re-running it here is idempotent and additionally mounts project detail
    // semantics before the rasteriser discovers videos/interactive elements.
    syncArticleReader(documentItem)

    const itemChanged = documentRaster.setItem(documentItem)
    if (itemChanged && interaction.isOpen) interaction.close(false)

    const nextId = documentItem ? 'document' : 'terminal'
    if (pipeline.setSource(nextId)) {
      app.dirty = true
      app.state.static = Math.max(app.state.static || 0, 0.7)
    }

    // Keep the legacy CSS value until display.css is migrated; it describes a
    // rasterised long-form document now, not specifically an article.
    tube.dataset.displayMode = documentItem ? 'article' : 'terminal'
    tube.classList.toggle('has-dom-surface', Boolean(documentItem))
    tube.classList.toggle('is-reading', Boolean(documentItem))
    if (!documentItem && interaction.isOpen) interaction.close(false)
    interaction.sync()
  }

  app.raster.paint = (term, reveal, cursorOn) => {
    syncSource()
    if (isDocument()) return documentRaster.paint(true)
    return terminalPaint(term, reveal, cursorOn)
  }

  const originalRender = app.render.bind(app)
  app.render = (...args) => {
    const result = originalRender(...args)
    syncSource()
    return result
  }

  let raf = 0
  const mediaFrame = () => {
    raf = requestAnimationFrame(mediaFrame)
    if (!isDocument()) return
    interaction.sync()
    if (documentRaster.videoNodes.some(video => !video.paused && !video.ended && video.readyState >= 2)) {
      app.dirty = true
    }
  }
  raf = requestAnimationFrame(mediaFrame)

  syncSource()

  const bridge = {
    documentRaster,
    articleRaster: documentRaster,
    interaction,
    pipeline,
    syncSource,
    enterFullscreen: () => pipeline.enterFullscreen(document.getElementById('screen')),
    exitFullscreen: () => pipeline.exitFullscreen(),
    destroy() {
      cancelAnimationFrame(raf)
      interaction.destroy()
      syncArticleReader(null)
      app.raster.paint = terminalPaint
      pipeline.setSource('terminal')
      tube.dataset.displayMode = 'terminal'
      tube.classList.remove('has-dom-surface', 'is-reading')
      delete app.__articleCRTBridge
    },
  }
  app.__articleCRTBridge = bridge
  app.displayPipeline = pipeline
  return bridge
}
