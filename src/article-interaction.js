/* ========================================================================== *
 * DocumentInteractionController
 *
 * Historical class/file naming is retained during migration, but this
 * controller now serves any long-form document. Video stays a first-class
 * local media case; every other provider is resolved through the integration
 * registry so project code never branches on Sketchfab, YouTube, Miro, etc.
 * ========================================================================== */
export class ArticleInteractionController {
  constructor({ tube, reader, rasteriser, integrations = null }) {
    this.tube = tube
    this.reader = reader
    this.rasteriser = rasteriser
    this.integrations = integrations
    this.trigger = document.getElementById('article-interact-trigger')
    this.overlay = document.getElementById('article-interaction')
    this.content = document.getElementById('article-interaction-content')
    this.closeButton = document.getElementById('article-interaction-close')
    this.activeEntry = null
    this.openEntry = null
    this.openMedia = null
    this.integrationCleanup = null

    this.trigger?.addEventListener('click', () => this.open())
    this.closeButton?.addEventListener('click', () => this.close())

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
    if (!this.isPoweredOn) {
      if (this.isOpen) this.close(false)
      if (this.trigger) this.trigger.hidden = true
      return
    }

    if (this.isOpen) return
    const entry = this.rasteriser?.getVisibleInteractiveEntry?.() || null
    this.activeEntry = entry
    if (!this.trigger) return

    const descriptor = this.rasteriser?.getInteraction?.(entry)
    const available = Boolean(descriptor && this.tube?.dataset.displayMode === 'article')
    this.trigger.hidden = !available
    if (!available) return

    const provider = descriptor.provider
    let label = '↗ OPEN INTEGRATION'
    if (provider === 'video') label = '▶ INTERACT VIDEO'
    if (provider === 'local-3d') label = '◈ INTERACT 3D'
    this.trigger.textContent = label
    this.trigger.setAttribute('aria-label', label.replace(/[▶↗◈]/g, '').trim())
  }

  open(entry = this.activeEntry) {
    if (!this.isPoweredOn || !entry || !this.overlay || !this.content) return false
    const descriptor = this.rasteriser?.getInteraction?.(entry)
    if (!descriptor) return false

    this.close(false)
    this.openEntry = entry
    this.content.replaceChildren()

    if (descriptor.provider === 'video') {
      const sourceVideo = this.rasteriser.videoNodes[entry.videoIndex]
      const video = document.createElement('video')
      video.className = 'article-interaction__video'
      video.src = descriptor.block.src
      video.controls = true
      video.autoplay = true
      video.playsInline = true
      video.preload = 'auto'
      video.loop = Boolean(descriptor.block.loop)
      if (sourceVideo && Number.isFinite(sourceVideo.currentTime)) {
        const seek = () => {
          try { video.currentTime = sourceVideo.currentTime } catch {}
          video.removeEventListener('loadedmetadata', seek)
        }
        video.addEventListener('loadedmetadata', seek)
      }
      this.openMedia = video
      this.content.append(video)
    } else {
      const resolved = this.integrations?.resolve(descriptor.block)
      if (!resolved) return false
      this.integrationCleanup = resolved.adapter.mount({
        block: descriptor.block,
        host: this.content,
        context: { descriptor, entry, rasteriser: this.rasteriser, controller: this },
      }) || null
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

    try { this.integrationCleanup?.() } catch (error) {
      console.warn('Document integration cleanup failed', error)
    }
    this.integrationCleanup = null

    this.overlay.hidden = true
    this.overlay.classList.remove('is-model3d-interaction')
    this.tube?.classList.remove('is-interacting')
    this.content?.replaceChildren()
    this.openEntry = null
    this.openMedia = null

    if (this.isPoweredOn) this.sync()
    else if (this.trigger) this.trigger.hidden = true
    return true
  }

  destroy() {
    this.close(false)
    removeEventListener('keydown', this._onKeyDown, { capture: true })
  }
}
