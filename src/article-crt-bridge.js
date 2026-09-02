import { syncArticleReader } from './article-reader.js'
import { ArticleRasteriser } from './article-rasteriser.js'
import { DisplayPipeline } from './display-pipeline.js'
import { createDefaultBlockRegistry } from './document/default-blocks.js'
import { createDefaultIntegrationRegistry } from './document/default-integrations.js'
import { InlineIntegrationController } from './document/inline-integrations.js'
import { SafeLocal3DManager } from './document/safe-local-3d.js'
import { enhanceModel3DFallback } from './document/model3d-fallback.js'
import { enhanceMediaBlocks } from './document/media-blocks.js'
import { MediaViewer } from './document/media-viewer.js'
import { DocumentProgressOverlay } from './document/progress-overlay.js'

/* ========================================================================== *
 * Article CRT runtime
 *
 * App owns navigation and the single persistent RAF. This runtime owns only
 * document pixel sources, rich integrations and media lifecycle. It plugs into
 * App through explicit frame/paint/back hooks instead of replacing App methods.
 * ========================================================================== */
class ArticleCRTRuntime {
  constructor(app, { tube, reader, documentCanvas }) {
    this.app = app
    this.tube = tube
    this.reader = reader
    this.documentCanvas = documentCanvas
    this.previousDisplayPipeline = app.displayPipeline

    this.pipeline = new DisplayPipeline({
      crt: app.crt,
      sources: {
        terminal: app.raster.canvas,
        document: documentCanvas,
      },
    })

    this.inlineIntegrations = null
    this.documentRaster = null
    this.progressOverlay = new DocumentProgressOverlay()
    this.mediaViewer = new MediaViewer({
      tube,
      crtCanvas: documentCanvas,
      onChange: ({ open } = {}) => {
        app.dirty = true
        if (open) this.inlineIntegrations?.clear?.()
        else this.documentRaster?.markDirty?.()
      },
    })

    this.local3d = new SafeLocal3DManager(() => {
      app.dirty = true
      this.documentRaster?.markDirty?.()
    })

    this.blockRegistry = enhanceMediaBlocks(
      enhanceModel3DFallback(createDefaultBlockRegistry({ local3d: this.local3d }), this.local3d),
    )
    this.integrations = createDefaultIntegrationRegistry({
      local3d: this.local3d,
      mediaViewer: this.mediaViewer,
    })

    this.documentRaster = new ArticleRasteriser(documentCanvas, reader, () => {
      app.dirty = true
    }, { blockRegistry: this.blockRegistry })

    this.inlineIntegrations = new InlineIntegrationController({
      tube,
      rasteriser: this.documentRaster,
      registry: this.integrations,
    })

    this.articleRaster = this.documentRaster
    this.destroyed = false
  }

  isDocument() {
    return (
      (this.app.state?.route === 'articles' || this.app.state?.route === 'projects') &&
      Boolean(this.app.state?.item)
    )
  }

  visibleLocal3DBlocks() {
    if (this.mediaViewer.isOpen) return []
    const visible = []
    for (const entry of this.documentRaster.layout || []) {
      if (entry.type !== 'model3d') continue
      const top = entry.y - this.documentRaster.scroll
      const bottom = top + entry.height
      if (bottom > 1 && top < this.documentRaster.readingHeight - 1) visible.push(entry.block)
    }
    return visible
  }

  syncSource() {
    if (this.destroyed) return
    const documentItem = this.isDocument() ? this.app.state.item : null
    syncArticleReader(documentItem)

    const itemChanged = this.documentRaster.setItem(documentItem)
    if (itemChanged) {
      this.mediaViewer.close()
      this.inlineIntegrations.clear()
    }

    const nextId = documentItem ? 'document' : 'terminal'
    if (this.pipeline.setSource(nextId)) {
      this.app._fitRaster()
      this.app.dirty = true
      this.app.state.static = this.mediaViewer.isOpen
        ? 0
        : Math.max(this.app.state.static || 0, 0.7)
    }

    this.tube.dataset.displayMode = this.mediaViewer.isOpen ? 'media' : documentItem ? 'article' : 'terminal'
    this.tube.classList.toggle('has-dom-surface', Boolean(documentItem) && !this.mediaViewer.isOpen)
    this.tube.classList.toggle('is-reading', Boolean(documentItem) && !this.mediaViewer.isOpen)
    if (!documentItem) this.mediaViewer.close()
  }

  paint() {
    this.syncSource()
    if (this.mediaViewer.isOpen) return true
    if (!this.isDocument()) return false

    this.documentRaster.paint(true)
    this.progressOverlay.paint(this.documentRaster)
    return true
  }

  captureReadingPosition() {
    if (!this.isDocument()) return null
    const range = Math.max(0, this.reader.scrollHeight - this.reader.clientHeight)
    return { item: this.app.state.item, progress: range ? this.reader.scrollTop / range : 0 }
  }

  setViewport(layout) {
    const position = this.captureReadingPosition()
    if (!this.documentRaster.setViewport(layout)) return
    this.restoreReadingPosition(position)
    this.inlineIntegrations.clear()
    this.mediaViewer.resize()
  }

  restoreReadingPosition(position) {
    if (!position || position.item !== this.app.state.item) return
    // The visible raster uses a normalized DOM scroll range. Fullscreen can
    // change the viewport height and trigger native scroll anchoring during
    // intermediate layout; restoring raw scrollTop would still move its pixels.
    const range = Math.max(0, this.reader.scrollHeight - this.reader.clientHeight)
    this.reader.scrollTop = position.progress * range
    this.documentRaster._syncScrollFromDOM()
    this.documentRaster.markDirty()
  }

  frame(time) {
    if (this.destroyed || !this.isDocument()) return

    if (this.mediaViewer.isOpen) {
      this.inlineIntegrations.clear()
      return
    }

    for (const block of this.visibleLocal3DBlocks()) this.local3d.tick(block, time)

    this.inlineIntegrations.sync()
    if (this.documentRaster.videoNodes.some(video => !video.paused && !video.ended && video.readyState >= 2)) {
      this.app.dirty = true
    }
  }

  handleBack() {
    if (!this.mediaViewer.isOpen) return false
    this.mediaViewer.close()
    this.syncSource()
    this.app.dirty = true
    return true
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.inlineIntegrations.destroy()
    this.mediaViewer.destroy()
    this.local3d.dispose()
    syncArticleReader(null)
    this.pipeline.setSource('terminal')

    if (this.previousDisplayPipeline === undefined) delete this.app.displayPipeline
    else this.app.displayPipeline = this.previousDisplayPipeline

    this.tube.dataset.displayMode = 'terminal'
    this.tube.classList.remove('has-dom-surface', 'is-reading', 'is-media-inspecting')
    if (this.app.__articleCRTBridge === this) delete this.app.__articleCRTBridge
    this.app.detachDocumentRuntime?.(this)
  }
}

export function attachArticleCRT(app) {
  if (!app || app.__articleCRTBridge) return app?.__articleCRTBridge || null

  const tube = document.getElementById('tube')
  const reader = document.getElementById('article-reader')
  const documentCanvas = document.getElementById('article-source')
  if (!tube || !reader || !documentCanvas || !app.crt || !app.raster) return null

  const runtime = new ArticleCRTRuntime(app, { tube, reader, documentCanvas })
  app.__articleCRTBridge = runtime
  app.displayPipeline = runtime.pipeline
  app.attachDocumentRuntime(runtime)
  runtime.inlineIntegrations.sync()
  return runtime
}
