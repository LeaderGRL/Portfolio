/* ========================================================================== *
 * MediaViewer
 *
 * Media inspection is a CRT display mode, not a browser modal. The viewer owns
 * a dedicated high-resolution canvas registered in DisplayPipeline. Opening an
 * image switches the physical CRT to that canvas; closing it returns to the
 * document source without touching the reader scroll position.
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

    this.canvas = document.createElement('canvas')
    this.canvas.id = 'media-inspect-source'
    this.canvas.className = 'display-pixel-source'
    this.canvas.width = 1440
    this.canvas.height = 1080
    this.canvas.setAttribute('aria-hidden', 'true')
    this.ctx = this.canvas.getContext('2d', { alpha: false })
    this.tube?.append(this.canvas)
    this.pipeline?.registerSource('media', this.canvas)

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

  _drawChrome(item) {
    const g = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    const footerH = 56

    g.fillStyle = '#010604'
    g.fillRect(0, h - footerH, w, footerH)
    g.strokeStyle = 'rgba(47,208,109,.42)'
    g.beginPath()
    g.moveTo(24, h - footerH + .5)
    g.lineTo(w - 24, h - footerH + .5)
    g.stroke()

    g.font = '700 20px ui-monospace, "SFMono-Regular", Consolas, monospace'
    g.textBaseline = 'middle'
    g.fillStyle = '#6bf39a'
    const label = String(item?.label || 'PROJECT MEDIA').toUpperCase()
    g.fillText(label.slice(0, 74), 28, h - footerH * .5)

    g.textAlign = 'right'
    g.fillStyle = '#ffb347'
    const count = this.items.length > 1 ? `${this.index + 1}/${this.items.length} · ` : ''
    g.fillText(`${count}BACK / ESC RETURN`, w - 28, h - footerH * .5)
    g.textAlign = 'left'
  }

  _paintLoading(item) {
    const g = this.ctx
    g.fillStyle = '#020b06'
    g.fillRect(0, 0, this.canvas.width, this.canvas.height)
    g.font = '700 24px ui-monospace, "SFMono-Regular", Consolas, monospace'
    g.fillStyle = '#2fd06d'
    g.fillText('LOADING PROJECT MEDIA...', 48, 70)
    this._drawChrome(item)
    this.onChange()
  }

  _paintImage(image, item) {
    const g = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    const footerH = 56
    const pad = 24
    const maxW = w - pad * 2
    const maxH = h - footerH - pad * 2

    g.fillStyle = '#010403'
    g.fillRect(0, 0, w, h)

    const sw = image.naturalWidth || image.width || 1
    const sh = image.naturalHeight || image.height || 1
    const scale = Math.min(maxW / sw, maxH / sh)
    const dw = Math.max(1, sw * scale)
    const dh = Math.max(1, sh * scale)
    const dx = (w - dw) * .5
    const dy = pad + (maxH - dh) * .5

    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(image, dx, dy, dw, dh)
    this._drawChrome(item)
    this.onChange()
  }

  _renderCurrent() {
    if (!this.isOpen) return
    const item = this.items[this.index]
    if (!item) return

    const request = ++this.token
    const image = this._image(item.src)
    this._paintLoading(item)

    const paint = () => {
      if (!this.isOpen || request !== this.token || this.items[this.index]?.src !== item.src) return
      this._paintImage(image, item)
    }

    if (image.complete && image.naturalWidth) {
      paint()
      return
    }

    image.onload = paint
    image.onerror = () => {
      if (!this.isOpen || request !== this.token) return
      const g = this.ctx
      g.fillStyle = '#020b06'
      g.fillRect(0, 0, this.canvas.width, this.canvas.height)
      g.font = '700 24px ui-monospace, "SFMono-Regular", Consolas, monospace'
      g.fillStyle = '#ffb347'
      g.fillText('MEDIA UNAVAILABLE', 48, 70)
      this._drawChrome(item)
      this.onChange()
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
    this.onChange()
    return true
  }

  destroy() {
    this.close()
    document.removeEventListener('keydown', this.onKeyDown, true)
    this.tube?.removeEventListener('click', this.onTubeClick, true)
    if (this.pipeline?.activeId === 'media') this.pipeline.setSource('document')
    this.pipeline?.unregisterSource('media')
    this.canvas.remove()
    this.cache.clear()
  }
}
