import { syncArticleReader } from './article-reader.js'
import { ArticleRasteriser } from './article-rasteriser.js'
import { DisplayPipeline } from './display-pipeline.js'
import { createDefaultBlockRegistry } from './document/default-blocks.js'
import { createDefaultIntegrationRegistry } from './document/default-integrations.js'
import { InlineIntegrationController } from './document/inline-integrations.js'
import { Local3DManager } from './document/local-3d.js'
import { enhanceMediaBlocks } from './document/media-blocks.js'
import { MediaViewer } from './document/media-viewer.js'
import { DocumentProgressOverlay } from './document/progress-overlay.js'

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
  const previousDisplayPipeline = app.displayPipeline
  const pipeline = new DisplayPipeline({
    crt: app.crt,
    sources: {
      terminal: terminalCanvas,
      document: documentCanvas,
    },
  })

  let inlineIntegrations = null
  let documentRaster = null
  const progressOverlay = new DocumentProgressOverlay()
  const mediaViewer = new MediaViewer({
    tube,
    crtCanvas: documentCanvas,
    onChange: ({ open } = {}) => {
      app.dirty = true
      if (open) inlineIntegrations?.clear?.()
      else documentRaster?.markDirty?.()
    },
  })
  const local3d = new Local3DManager(() => {
    app.dirty = true
    documentRaster?.markDirty?.()
  })
  const blockRegistry = enhanceMediaBlocks(createDefaultBlockRegistry({ local3d }))
  const integrations = createDefaultIntegrationRegistry({ local3d, mediaViewer })

  documentRaster = new ArticleRasteriser(documentCanvas, reader, () => {
    app.dirty = true
  }, { blockRegistry })

  inlineIntegrations = new InlineIntegrationController({
    tube,
    rasteriser: documentRaster,
    registry: integrations,
  })

  const isDocument = () => (
    (app.state?.route === 'articles' || app.state?.route === 'projects') &&
    Boolean(app.state?.item)
  )

  const visibleLocal3DBlocks = () => {
    if (mediaViewer.isOpen) return []
    const visible = []
    for (const entry of documentRaster.layout || []) {
      if (entry.type !== 'model3d') continue
      const top = entry.y - documentRaster.scroll
      const bottom = top + entry.height
      if (bottom > 1 && top < documentCanvas.height - 1) visible.push(entry.block)
    }
    return visible
  }

  const syncSource = () => {
    const documentItem = isDocument() ? app.state.item : null
    syncArticleReader(documentItem)

    const itemChanged = documentRaster.setItem(documentItem)
    if (itemChanged) {
      mediaViewer.close()
      inlineIntegrations.clear()
    }

    const nextId = documentItem ? 'document' : 'terminal'
    if (pipeline.setSource(nextId)) {
      app.dirty = true
      app.state.static = mediaViewer.isOpen
        ? 0
        : Math.max(app.state.static || 0, 0.7)
    }

    tube.dataset.displayMode = mediaViewer.isOpen ? 'media' : documentItem ? 'article' : 'terminal'
    tube.classList.toggle('has-dom-surface', Boolean(documentItem) && !mediaViewer.isOpen)
    tube.classList.toggle('is-reading', Boolean(documentItem) && !mediaViewer.isOpen)
    if (!documentItem) mediaViewer.close()
  }

  app.raster.paint = (term, reveal, cursorOn) => {
    syncSource()
    if (mediaViewer.isOpen) return true
    if (isDocument()) {
      const painted = documentRaster.paint(true)
      progressOverlay.paint(documentRaster)
      return painted
    }
    return terminalPaint(term, reveal, cursorOn)
  }

  const originalRender = app.render.bind(app)
  app.render = (...args) => {
    const result = originalRender(...args)
    syncSource()
    return result
  }

  const originalBack = app.back.bind(app)
  app.back = (...args) => {
    if (mediaViewer.isOpen) {
      mediaViewer.close()
      syncSource()
      app.dirty = true
      return
    }
    return originalBack(...args)
  }

  let raf = 0
  const mediaFrame = time => {
    raf = requestAnimationFrame(mediaFrame)
    if (!isDocument()) return

    if (mediaViewer.isOpen) {
      inlineIntegrations.clear()
      return
    }

    for (const block of visibleLocal3DBlocks()) local3d.tick(block, time)

    inlineIntegrations.sync()
    if (documentRaster.videoNodes.some(video => !video.paused && !video.ended && video.readyState >= 2)) {
      app.dirty = true
    }
  }
  raf = requestAnimationFrame(mediaFrame)

  syncSource()
  inlineIntegrations.sync()

  const bridge = {
    documentRaster,
    articleRaster: documentRaster,
    blockRegistry,
    integrations,
    inlineIntegrations,
    local3d,
    mediaViewer,
    progressOverlay,
    pipeline,
    syncSource,
    enterFullscreen: () => pipeline.enterFullscreen(document.getElementById('screen')),
    exitFullscreen: () => pipeline.exitFullscreen(),
    destroy() {
      cancelAnimationFrame(raf)
      app.back = originalBack
      app.render = originalRender
      inlineIntegrations.destroy()
      mediaViewer.destroy()
      local3d.dispose()
      syncArticleReader(null)
      app.raster.paint = terminalPaint
      pipeline.setSource('terminal')
      if (previousDisplayPipeline === undefined) delete app.displayPipeline
      else app.displayPipeline = previousDisplayPipeline
      tube.dataset.displayMode = 'terminal'
      tube.classList.remove('has-dom-surface', 'is-reading', 'is-media-inspecting')
      delete app.__articleCRTBridge
    },
  }
  app.__articleCRTBridge = bridge
  app.displayPipeline = pipeline
  return bridge
}
