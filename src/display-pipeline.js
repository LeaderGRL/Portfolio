import { SRC_H, SRC_W } from './core.js'
import { CRT } from './crt.js'

/* ========================================================================== *
 * DisplayPipeline
 *
 * One physical CRT, many pixel sources. Providers register canvas-like sources
 * here; switching source never creates another optical pipeline.
 * ========================================================================== */
export class DisplayPipeline {
  constructor({ outputCanvas = null, crt = null, sources = {} }) {
    this.sources = new Map(Object.entries(sources))
    this.activeId = this.sources.keys().next().value || null
    const initial = this.activeId ? this.sources.get(this.activeId) : null
    this.crt = crt || (initial && outputCanvas ? new CRT(outputCanvas, initial) : null)
    if (this.crt && initial) this.crt.source = initial
    this.ok = Boolean(this.crt?.ok)
  }

  registerSource(id, source) {
    if (!id || !source) return false
    this.sources.set(id, source)
    if (!this.activeId) {
      this.activeId = id
      if (this.crt) this.crt.source = source
    }
    return true
  }

  unregisterSource(id) {
    if (!this.sources.has(id) || id === this.activeId) return false
    this.sources.delete(id)
    return true
  }

  _clearPersistence() {
    const crt = this.crt
    const gl = crt?.gl
    if (!gl || !crt.a || !crt.b) return
    const previous = gl.getParameter?.(gl.FRAMEBUFFER_BINDING)
    gl.clearColor(0, 0, 0, 1)
    for (const target of [crt.a, crt.b]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb)
      gl.viewport(0, 0, crt.sourceWidth || SRC_W, crt.sourceHeight || SRC_H)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, previous || null)
  }

  setSource(id) {
    const source = this.sources.get(id)
    if (!source || this.activeId === id) return false
    this.activeId = id
    if (this.crt) this.crt.source = source
    this._clearPersistence()
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
}
