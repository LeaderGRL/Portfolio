import { CRT } from './crt.js'

/* ========================================================================== *
 * DisplayPipeline
 *
 * The physical tube has exactly one post-process. Content providers only own
 * pixels. The terminal, article rasteriser, future games, software emulators,
 * Rive canvases or WASM renderers register a canvas-like source here and the
 * same CRT shader processes whichever source is active.
 *
 * This keeps display optics independent from application content and makes
 * fullscreen a resize concern rather than a second rendering architecture.
 * ========================================================================== */
export class DisplayPipeline {
  constructor({ outputCanvas, sources = {} }) {
    this.sources = new Map(Object.entries(sources))
    this.activeId = this.sources.keys().next().value || null
    const initial = this.activeId ? this.sources.get(this.activeId) : null
    this.crt = initial ? new CRT(outputCanvas, initial) : null
    this.ok = Boolean(this.crt?.ok)
  }

  registerSource(id, source) {
    if (!id || !source) return false
    this.sources.set(id, source)
    if (!this.activeId) {
      this.activeId = id
      this.crt?.setSource(source)
    }
    return true
  }

  unregisterSource(id) {
    if (!this.sources.has(id) || id === this.activeId) return false
    this.sources.delete(id)
    return true
  }

  setSource(id) {
    const source = this.sources.get(id)
    if (!source || this.activeId === id) return false
    this.activeId = id
    this.crt?.setSource(source)
    return true
  }

  getSource(id = this.activeId) {
    return this.sources.get(id) || null
  }

  resize(cssWidth, cssHeight, dpr) {
    this.crt?.resize(cssWidth, cssHeight, dpr)
  }

  render(state, sourceDirty = false) {
    if (!this.ok) return false
    this.crt.render(state, sourceDirty)
    return true
  }

  async enterFullscreen(target) {
    const node = target || document.getElementById('screen') || document.querySelector('.screen')
    if (!node || document.fullscreenElement) return false
    await node.requestFullscreen?.()
    return true
  }

  async exitFullscreen() {
    if (!document.fullscreenElement) return false
    await document.exitFullscreen?.()
    return true
  }
}
