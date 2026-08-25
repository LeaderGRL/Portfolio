import { CRTOverlay } from './crt-overlay.js'

/* ========================================================================== *
 * DisplayCompositor
 *
 * Owns the common physical display stack independently from the content type.
 * A surface is simply a DOM element mounted inside #display-surface. Today the
 * article reader is the only DOM surface; later software, games, iframe apps,
 * Canvas/WebGL demos or WASM views can mount into the same slot and inherit the
 * same CRT overlay, glass and future fullscreen behaviour.
 * ========================================================================== */

export class DisplayCompositor {
  constructor({ tube, surfaceRoot, overlayCanvas }) {
    this.tube = tube
    this.surfaceRoot = surfaceRoot
    this.overlay = new CRTOverlay(overlayCanvas)
    this.mode = 'terminal'
    this.crtEnabled = true
    this.powered = true
  }

  setMode(mode) {
    if (this.mode === mode) return
    this.mode = mode
    this.tube.dataset.displayMode = mode
    this.tube.classList.toggle('has-dom-surface', mode !== 'terminal')
    this.overlay.setEnabled(this.crtEnabled && this.powered && mode !== 'terminal')
    this.overlay.burstStatic(0.78)
  }

  setCRTEnabled(enabled) {
    this.crtEnabled = Boolean(enabled)
    this.tube.classList.toggle('is-crt-off', !this.crtEnabled)
    this.overlay.setEnabled(this.crtEnabled && this.powered && this.mode !== 'terminal')
  }

  setPowered(powered) {
    this.powered = Boolean(powered)
    this.tube.classList.toggle('is-powered-off', !this.powered)
    this.overlay.setEnabled(this.crtEnabled && this.powered && this.mode !== 'terminal')
  }

  triggerDegauss() {
    this.overlay.triggerDegauss()
  }

  resize(dpr = devicePixelRatio || 1) {
    const rect = this.tube.getBoundingClientRect()
    const width = this.tube.offsetWidth || rect.width || 1
    const height = this.tube.offsetHeight || rect.height || 1
    this.overlay.resize(width, height, dpr)
  }

  render(timeSeconds, dt) {
    if (this.mode === 'terminal') return false
    return this.overlay.render(timeSeconds, dt)
  }

  async enterFullscreen() {
    const target = this.tube.closest('.screen') || this.tube
    if (!document.fullscreenElement) {
      await target.requestFullscreen?.()
      return true
    }
    return false
  }

  async exitFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.()
      return true
    }
    return false
  }
}
