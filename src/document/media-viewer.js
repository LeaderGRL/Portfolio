/* ========================================================================== *
 * MediaViewer
 *
 * High-resolution inspection surface for project images. The document raster
 * remains the visual source inside the CRT; this viewer is intentionally a
 * separate inspection mode so diagrams and photographs can be read at their
 * native resolution without changing the project block renderer.
 * ========================================================================== */
export class MediaViewer {
  constructor() {
    this.items = []
    this.index = 0

    this.root = document.createElement('section')
    this.root.className = 'document-media-viewer'
    this.root.hidden = true
    this.root.setAttribute('aria-modal', 'true')
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', 'Project media viewer')

    this.backdrop = document.createElement('button')
    this.backdrop.className = 'document-media-viewer__backdrop'
    this.backdrop.type = 'button'
    this.backdrop.setAttribute('aria-label', 'Close media viewer')

    this.stage = document.createElement('div')
    this.stage.className = 'document-media-viewer__stage'

    this.image = document.createElement('img')
    this.image.className = 'document-media-viewer__image'
    this.image.alt = ''

    this.caption = document.createElement('p')
    this.caption.className = 'document-media-viewer__caption'

    this.closeButton = document.createElement('button')
    this.closeButton.className = 'document-media-viewer__close'
    this.closeButton.type = 'button'
    this.closeButton.textContent = '× CLOSE'

    this.prevButton = document.createElement('button')
    this.prevButton.className = 'document-media-viewer__nav document-media-viewer__nav--prev'
    this.prevButton.type = 'button'
    this.prevButton.textContent = '← PREV'

    this.nextButton = document.createElement('button')
    this.nextButton.className = 'document-media-viewer__nav document-media-viewer__nav--next'
    this.nextButton.type = 'button'
    this.nextButton.textContent = 'NEXT →'

    this.stage.append(this.image, this.caption, this.closeButton, this.prevButton, this.nextButton)
    this.root.append(this.backdrop, this.stage)
    document.body.append(this.root)

    this.backdrop.addEventListener('click', () => this.close())
    this.closeButton.addEventListener('click', () => this.close())
    this.prevButton.addEventListener('click', () => this.step(-1))
    this.nextButton.addEventListener('click', () => this.step(1))

    this.onKeyDown = event => {
      if (this.root.hidden) return
      if (event.key === 'Escape') {
        event.preventDefault()
        this.close()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        this.step(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        this.step(1)
      }
    }
    addEventListener('keydown', this.onKeyDown)
  }

  open(items, index = 0) {
    const normalized = (items || [])
      .filter(item => item?.src)
      .map(item => ({ src: item.src, label: item.label || '' }))
    if (!normalized.length) return
    this.items = normalized
    this.index = Math.max(0, Math.min(normalized.length - 1, Number(index) || 0))
    this.root.hidden = false
    document.body.classList.add('has-media-viewer')
    this.render()
    this.closeButton.focus({ preventScroll: true })
  }

  render() {
    const item = this.items[this.index]
    if (!item) return
    this.image.src = item.src
    this.image.alt = item.label
    this.caption.textContent = item.label
    this.caption.hidden = !item.label
    const multiple = this.items.length > 1
    this.prevButton.hidden = !multiple
    this.nextButton.hidden = !multiple
  }

  step(direction) {
    if (this.items.length < 2) return
    this.index = (this.index + direction + this.items.length) % this.items.length
    this.render()
  }

  close() {
    if (this.root.hidden) return
    this.root.hidden = true
    this.image.removeAttribute('src')
    document.body.classList.remove('has-media-viewer')
  }

  destroy() {
    removeEventListener('keydown', this.onKeyDown)
    this.root.remove()
  }
}
