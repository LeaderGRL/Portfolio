import { ArticleInteractionController } from './article-interaction.js'
import { syncArticleReader } from './article-reader.js'
import { ArticleRasteriser } from './article-rasteriser.js'
import { DisplayPipeline } from './display-pipeline.js'
import { createDefaultBlockRegistry } from './document/default-blocks.js'
import { createDefaultIntegrationRegistry } from './document/default-integrations.js'
import { InlineIntegrationController } from './document/inline-integrations.js'
import { Local3DManager } from './document/local-3d.js'

/* ========================================================================== *
 * Document CRT bridge
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
  let inlineIntegrations = null
  const local3d = new Local3DManager(() => {
    app.dirty = true
    documentRaster?.markDirty?.()
  })
  const blockRegistry = createDefaultBlockRegistry({ local3d })
  const integrations = createDefaultIntegrationRegistry({ local3d })

  const documentRaster = new ArticleRasteriser(documentCanvas, reader, () => {
    app.dirty = true
    interaction?.sync()
    inlineIntegrations?.sync()
  }, { blockRegistry })

  interaction = new ArticleInteractionController({
    tube,
    reader,
    rasteriser: documentRaster,
    integrations,
  })
  inlineIntegrations = new InlineIntegrationController({
    tube,
    rasteriser: documentRaster,
    registry: integrations,
  })

  const isDocument = () => (
    (app.state?.route === 'articles' || app.state?.route === 'projects') &&
    Boolean(app.state?.item)
  )

  const syncSource = () => {
    const documentItem = isDocument() ? app.state.item : null
    syncArticleReader(documentItem)

    const itemChanged = documentRaster.setItem(documentItem)
    if (itemChanged) {
      if (interaction.isOpen) interaction.close(false)
      inlineIntegrations.clear()
    }

    const nextId = documentItem ? 'document' : 'terminal'
    if (pipeline.setSource(nextId)) {
      app.dirty = true
      app.state.static = Math.max(app.state.static || 0, 0.7)
    }

    tube.dataset.displayMode = documentItem ? 'article' : 'terminal'
    tube.classList.toggle('has-dom-surface', Boolean(documentItem))
    tube.classList.toggle('is-reading', Boolean(documentItem))
    if (!documentItem && interaction.isOpen) interaction.close(false)
    interaction.sync()
    inlineIntegrations.sync()
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
  const mediaFrame = time => {
    raf = requestAnimationFrame(mediaFrame)
    if (!isDocument()) return

    local3d.tick(time)
    interaction.sync()
    inlineIntegrations.sync()
    if (documentRaster.videoNodes.some(video => !video.paused && !video.ended && video.readyState >= 2)) {
      app.dirty = true
    }
  }
  raf = requestAnimationFrame(mediaFrame)

  syncSource()

  const bridge = {
    documentRaster,
    articleRaster: documentRaster,
    blockRegistry,
    integrations,
    inlineIntegrations,
    local3d,
    interaction,
    pipeline,
    syncSource,
    enterFullscreen: () => pipeline.enterFullscreen(document.getElementById('screen')),
    exitFullscreen: () => pipeline.exitFullscreen(),
    destroy() {
      cancelAnimationFrame(raf)
      inlineIntegrations.destroy()
      interaction.destroy()
      local3d.dispose()
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
