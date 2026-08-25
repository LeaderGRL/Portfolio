/* ========================================================================== *
 * MediaViewer
 *
 * Media inspection is a CRT display mode, not a browser modal.
 *
 * Two synchronized canvases are used deliberately:
 * - crtCanvas: 480x360, exactly matching the native CRT source resolution;
 * - hiresCanvas: 1440x1080, displayed only when CRT effects are disabled.
 *
 * This keeps the WebGL CRT path stable while still giving the user a clean,
 * high-resolution inspection surface in CRT-off mode.
 * ========================================================================== */
export class MediaViewer {
  constructor({ tube, pipeline, onChange = () => {} }) {
    this.tube = tube
    this.pipeline = pipeline
    this.onChange = onChange
    this.items = []
    this.index = 0
    this.isOpen = false
    this.token = 0
    this.cache = new Map()

    this.crtCanvas = document.createElement('canvas')
    this.crtCanvas.id = 'media-inspect-source'
    this.crtCanvas.className = 'display-pixel-source'
    this.crtCanvas.width = 480
    this.crtCanvas.height = 360
    this.crtCanvas.setAttribute('aria-hidden', 'true')
    this.crtCtx = this.crtCanvas.getContext('2d', { alpha: false })

    this.hiresCanvas = document.createElement('canvas')
    this.hiresCanvas.id = 'media-inspect-hires'
    this.hiresCanvas.className = 'display-pixel-source'
    this.hiresCanvas.width = 1440
    this.hiresCanvas.height = 1080
    this.hiresCanvas.setAttribute('aria-hidden', 'true')
    this.hiresCtx = this.hiresCanvas.getContext('2d', { alpha: false })

    this.tube?.append(this.crtCanvas, this.hiresCanvas)
    this.pipeline?.registerSource('media', this.crtCanvas)

    this.onKeyDown = event => {
      if (!this.isOpen) return
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
        this.close()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        this.step(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        this.step(1)
      }
    }
    document.addEventListener('keydown', this.onKeyDown, true)

    this.onTubeClick = event => {
      if (!this.isOpen) return
      event.preventDefault()
      event.stopPropagation()
      this.close()
    }
    this.tube?.addEventListener('click', this.onTubeClick, true)
  }

  _normalize(items) {
    return (items || [])
      .filter(item => item?.src)
      .map(item => ({ src: item.src, label: item.label || '' }))
  }

  _image(src) {
    let image = this.cache.get(src)
    if (image) return image
    image = new Image()
    image.decoding = 'async'
    this.cache.set(src, image)
    return image
  }

  _paintLoading(ctx, width, height) {
    ctx.fillStyle = '#010403'
    ctx.fillRect(0, 0, width, height)
  }

  _paintImageTo(ctx, width, height, image) {
    ctx.fillStyle = '#010403'
    ctx.fillRect(0, 0, width, height)

    const sw = image.naturalWidth || image.width || 1
    const sh = image.naturalHeight || image.height || 1
    const pad = Math.max(4, Math.round(Math.min(width, height) * 0.018))
    const maxW = Math.max(1, width - pad * 2)
    const maxH = Math.max(1, height - pad * 2)
    const scale = Math.min(maxW / sw, maxH / sh)
    const dw = Math.max(1, sw * scale)
    const dh = Math.max(1, sh * scale)
    const dx = (width - dw) * 0.5
    const dy = (height - dh) * 0.5

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, dx, dy, dw, dh)
  }

  _paintLoadingState() {
    this._paintLoading(this.crtCtx, this.crtCanvas.width, this.crtCanvas.height)
    this._paintLoading(this.hiresCtx, this.hiresCanvas.width, this.hiresCanvas.height)
    this.onChange()
  }

  _paintResolved(image) {
    this._paintImageTo(this.crtCtx, this.crtCanvas.width, this.crtCanvas.height, image)
    this._paintImageTo(this.hiresCtx, this.hiresCanvas.width, this.hiresCanvas.height, image)
    this.onChange()
  }

  _renderCurrent() {
    if (!this.isOpen) return
    const item = this.items[this.index]
    if (!item) return

    const request = ++this.token
    const image = this._image(item.src)
    this._paintLoadingState()

    const paint = () => {
      if (!this.isOpen || request !== this.token || this.items[this.index]?.src !== item.src) return
      this._paintResolved(image)
    }

    if (image.complete && image.naturalWidth) {
      paint()
      return
    }

    image.onload = paint
    image.onerror = () => {
      if (!this.isOpen || request !== this.token) return
      this._paintLoadingState()
    }
    image.src = item.src
  }

  open(items, index = 0) {
    const normalized = this._normalize(items)
    if (!normalized.length) return false
    this.items = normalized
    this.index = Math.max(0, Math.min(normalized.length - 1, Number(index) || 0))
    this.isOpen = true
    this.tube?.classList.add('is-media-inspecting')
    this.pipeline?.setSource('media')
    this._renderCurrent()
    this.onChange()
    return true
  }

  step(direction) {
    if (!this.isOpen || this.items.length < 2) return false
    this.index = (this.index + direction + this.items.length) % this.items.length
    this._renderCurrent()
    return true
  }

  close() {
    if (!this.isOpen) return false
    this.isOpen = false
    this.token++
    this.tube?.classList.remove('is-media-inspecting')
    this.pipeline?.setSource('document')
    this.onChange()
    return true
  }

  destroy() {
    this.close()
    document.removeEventListener('keydown', this.onKeyDown, true)
    this.tube?.removeEventListener('click', this.onTubeClick, true)
    if (this.pipeline?.activeId === 'media') this.pipeline.setSource('document')
    this.pipeline?.unregisterSource('media')
    this.crtCanvas.remove()
    this.hiresCanvas.remove()
    this.cache.clear()
  }
}
