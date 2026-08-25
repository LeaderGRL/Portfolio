/* ========================================================================== *
 * MediaViewer
 *
 * Media inspection stays inside the physical CRT.
 *
 * CRT ON deliberately reuses the proven document framebuffer (`article-source`)
 * instead of switching WebGL to a third source. While inspection is open, the
 * document rasteriser is paused and this viewer owns those 480x360 pixels.
 * Closing the viewer simply lets the document repaint at the exact same scroll.
 *
 * CRT OFF uses a separate 1440x1080 canvas so project media can be inspected
 * cleanly at a substantially higher resolution.
 * ========================================================================== */
export class MediaViewer {
  constructor({ tube, crtCanvas, onChange = () => {} }) {
    this.tube = tube
    this.crtCanvas = crtCanvas
    this.crtCtx = crtCanvas?.getContext?.('2d', { alpha: false }) || null
    this.onChange = onChange
    this.items = []
    this.index = 0
    this.isOpen = false
    this.token = 0
    this.cache = new Map()

    this.hiresCanvas = document.createElement('canvas')
    this.hiresCanvas.id = 'media-inspect-hires'
    this.hiresCanvas.className = 'display-pixel-source'
    this.hiresCanvas.width = 1440
    this.hiresCanvas.height = 1080
    this.hiresCanvas.setAttribute('aria-hidden', 'true')
    this.hiresCtx = this.hiresCanvas.getContext('2d', { alpha: false })
    this.tube?.append(this.hiresCanvas)

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

  _clear(ctx, width, height) {
    if (!ctx) return
    ctx.fillStyle = '#010403'
    ctx.fillRect(0, 0, width, height)
  }

  _paintImageTo(ctx, width, height, image) {
    if (!ctx) return
    this._clear(ctx, width, height)

    const sw = image.naturalWidth || image.width || 1
    const sh = image.naturalHeight || image.height || 1
    const pad = Math.max(3, Math.round(Math.min(width, height) * 0.015))
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
    this._clear(this.crtCtx, this.crtCanvas?.width || 480, this.crtCanvas?.height || 360)
    this._clear(this.hiresCtx, this.hiresCanvas.width, this.hiresCanvas.height)
    this.onChange({ open: true, resolved: false })
  }

  _paintResolved(image) {
    this._paintImageTo(
      this.crtCtx,
      this.crtCanvas?.width || 480,
      this.crtCanvas?.height || 360,
      image,
    )
    this._paintImageTo(this.hiresCtx, this.hiresCanvas.width, this.hiresCanvas.height, image)
    this.onChange({ open: true, resolved: true })
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
    if (!normalized.length || !this.crtCtx) return false
    this.items = normalized
    this.index = Math.max(0, Math.min(normalized.length - 1, Number(index) || 0))
    this.isOpen = true
    this.tube?.classList.add('is-media-inspecting')
    this._renderCurrent()
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
    this.onChange({ open: false, resolved: false })
    return true
  }

  destroy() {
    this.close()
    document.removeEventListener('keydown', this.onKeyDown, true)
    this.tube?.removeEventListener('click', this.onTubeClick, true)
    this.hiresCanvas.remove()
    this.cache.clear()
  }
}
