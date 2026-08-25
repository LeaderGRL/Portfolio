/* ========================================================================== *
 * ArticleInteractionController
 *
 * Article pixels remain in the real CRT pipeline. Native video controls and
 * cross-origin iframes cannot be rasterised into WebGL and stay interactive at
 * the same time, so an explicit interaction mode temporarily mounts a native
 * surface above the CRT framebuffer but below the photographic glass.
 *
 * The user always sees a visible action button when an interactive block is in
 * the raster viewport. No invisible hit targets are required.
 * ========================================================================== */
export class ArticleInteractionController {
  constructor({ tube, reader, rasteriser }) {
    this.tube = tube
    this.reader = reader
    this.rasteriser = rasteriser
    this.trigger = document.getElementById('article-interact-trigger')
    this.overlay = document.getElementById('article-interaction')
    this.content = document.getElementById('article-interaction-content')
    this.closeButton = document.getElementById('article-interaction-close')
    this.activeEntry = null
    this.openEntry = null
    this.openMedia = null

    this.trigger?.addEventListener('click', () => this.open())
    this.closeButton?.addEventListener('click', () => this.close())

    // Capture Escape before App's global navigation handler. When a native
    // integration is open, Escape belongs to that local interaction first.
    this._onKeyDown = event => {
      if (!this.isOpen || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      this.close()
    }
    addEventListener('keydown', this._onKeyDown, { capture: true })
  }

  get isOpen() {
    return Boolean(this.overlay && !this.overlay.hidden)
  }

  get isPoweredOn() {
    return !this.tube?.classList.contains('is-powered-off')
  }

  sync() {
    // Powering the physical tube off must also tear down native overlays.
    // Otherwise an iframe/video could stay visible after the CRT picture dies.
    if (!this.isPoweredOn) {
      if (this.isOpen) this.close(false)
      if (this.trigger) this.trigger.hidden = true
      return
    }

    if (this.isOpen) return
    const entry = this.rasteriser?.getVisibleInteractiveEntry?.() || null
    this.activeEntry = entry
    if (!this.trigger) return

    const available = Boolean(entry && this.tube?.dataset.displayMode === 'article')
    this.trigger.hidden = !available
    if (!available) return

    this.trigger.textContent = entry.type === 'video' ? '▶ INTERACT VIDEO' : '↗ OPEN INTEGRATION'
    this.trigger.setAttribute(
      'aria-label',
      entry.type === 'video' ? 'Open native video controls' : 'Open interactive integration',
    )
  }

  open(entry = this.activeEntry) {
    if (!this.isPoweredOn || !entry || !this.overlay || !this.content) return false
    this.close(false)
    this.openEntry = entry
    this.content.replaceChildren()

    if (entry.type === 'video') {
      const sourceVideo = this.rasteriser.videoNodes[entry.videoIndex]
      const video = document.createElement('video')
      video.className = 'article-interaction__video'
      video.src = entry.block.src
      video.controls = true
      video.autoplay = true
      video.playsInline = true
      video.preload = 'auto'
      video.loop = Boolean(entry.block.loop)
      if (sourceVideo && Number.isFinite(sourceVideo.currentTime)) {
        const seek = () => {
          try { video.currentTime = sourceVideo.currentTime } catch {}
          video.removeEventListener('loadedmetadata', seek)
        }
        video.addEventListener('loadedmetadata', seek)
      }
      this.openMedia = video
      this.content.append(video)
    } else if (entry.type === 'embed') {
      const iframe = document.createElement('iframe')
      iframe.className = 'article-interaction__embed'
      iframe.src = entry.block.src
      iframe.title = entry.block.title || entry.block.label || 'Article integration'
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')
      iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen')
      this.openMedia = iframe
      this.content.append(iframe)
    } else {
      return false
    }

    this.overlay.hidden = false
    this.trigger.hidden = true
    this.tube?.classList.add('is-interacting')
    this.closeButton?.focus({ preventScroll: true })
    return true
  }

  close(syncVideo = true) {
    if (!this.overlay) return false

    if (syncVideo && this.openEntry?.type === 'video' && this.openMedia instanceof HTMLVideoElement) {
      const sourceVideo = this.rasteriser.videoNodes[this.openEntry.videoIndex]
      if (sourceVideo) {
        try { sourceVideo.currentTime = this.openMedia.currentTime } catch {}
        if (!this.openMedia.paused) sourceVideo.play?.().catch?.(() => {})
      }
      this.rasteriser.markDirty()
    }

    this.overlay.hidden = true
    this.tube?.classList.remove('is-interacting')
    this.content?.replaceChildren()
    this.openEntry = null
    this.openMedia = null

    // Avoid recursively reopening/closing while the tube is powered off.
    if (this.isPoweredOn) this.sync()
    else if (this.trigger) this.trigger.hidden = true
    return true
  }

  destroy() {
    this.close(false)
    removeEventListener('keydown', this._onKeyDown, { capture: true })
  }
}
