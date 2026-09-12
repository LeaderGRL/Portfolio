import { foley } from '../audio.js'
import { clamp } from '../core.js'

export class MachineStateController {
  constructor(app) {
    this.app = app
    this.ownsNativeFullscreen = false
    this.nativeFullscreenRequest = null
    this.fullscreenReturnFocus = null
    this.fullscreenFocusFrame = 0
  }

  install() {
    this.syncPowerSurface()
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
      document.addEventListener(type, () => this.onNativeFullscreenChange())
    }
    for (const type of ['fullscreenerror', 'webkitfullscreenerror']) {
      document.addEventListener(type, event => this.onNativeFullscreenError(event))
    }
  }

  syncPowerSurface() {
    const rocker = document.getElementById('power')
    const tube = document.getElementById('tube')
    const on = this.app.state.powerTarget >= 0.5
    rocker?.classList.toggle('is-on', on)
    rocker?.setAttribute('aria-pressed', String(on))
    tube?.classList.toggle('is-powered-off', !on)
  }

  toggleCrt() {
    const sw = document.getElementById('crt-switch')
    if (!sw) return false
    const on = sw.getAttribute('aria-checked') !== 'true'
    sw.setAttribute('aria-checked', String(on))
    this.app.state.crtTarget = on ? 1 : 0
    document.getElementById('tube')?.classList.toggle('is-crt-off', !on)
    foley.ensure()
    foley.clunk(1.4)
    return on
  }

  setVolume(value) {
    const slider = document.getElementById('volume')
    const thumb = document.getElementById('volume-thumb')
    if (!slider || !thumb) return 0
    const volume = clamp(value, 0, 1)
    this.app.volume = volume
    thumb.style.left = `${8 + volume * (slider.clientWidth - 16)}px`
    slider.setAttribute('aria-valuenow', Math.round(volume * 100))
    foley.setVolume(volume * 0.7)
    return volume
  }

  togglePower() {
    const app = this.app
    const on = app.state.powerTarget < 0.5
    app.state.powerTarget = on ? 1 : 0
    this.syncPowerSurface()
    foley.ensure()
    foley.clunk(on ? 0.85 : 0.7)
    if (on) {
      app.state.degauss = 1
      app.state.warm = 0
      foley.degauss()
      foley.humOn(true)
      app.render()
    } else {
      foley.humOn(false)
    }
    return on
  }

  toggleFullscreen() {
    return this.setFullscreen(!this.app.state.fullscreen)
  }

  setFullscreen(on) {
    const app = this.app
    on = Boolean(on)
    if (app.state.fullscreen === on) return false
    const readingPosition = app.documentRuntime?.captureReadingPosition?.()
    if (on) this.fullscreenReturnFocus = document.activeElement
    app.state.fullscreen = on
    document.body.classList.toggle('is-crt-fullscreen', on)
    document.getElementById('fullscreen-switch')?.setAttribute('aria-checked', String(on))
    foley.ensure()
    foley.clunk(on ? 1.15 : 0.95)
    this.syncNativeFullscreen(on)
    app._fit()
    app.documentRuntime?.restoreReadingPosition?.(readingPosition)
    cancelAnimationFrame(this.fullscreenFocusFrame)
    this.fullscreenFocusFrame = requestAnimationFrame(() => {
      if (app.state.fullscreen !== on) return
      const previous = this.fullscreenReturnFocus
      const target = on
        ? document.querySelector('.softkeys__key--exit')
        : previous?.isConnected && previous.getClientRects().length && previous !== document.body
          ? previous
          : document.getElementById('fullscreen-switch')
      target?.focus({ preventScroll: true })
      if (!on) this.fullscreenReturnFocus = null
    })
    app.state.static = Math.max(app.state.static, 0.55)
    app.dirty = true
    return true
  }

  syncNativeFullscreen(on) {
    const root = document.documentElement
    const active = document.fullscreenElement || document.webkitFullscreenElement
    try {
      if (on) {
        if (active || this.nativeFullscreenRequest) return
        const request = root.requestFullscreen || root.webkitRequestFullscreen
        if (!request) return
        const token = {}
        this.nativeFullscreenRequest = token
        const pending = request.call(root, { navigationUI: 'hide' })
        if (!pending?.then) return
        pending.then(() => {
          if (this.nativeFullscreenRequest !== token) return
          const current = document.fullscreenElement || document.webkitFullscreenElement
          if (current === root) {
            this.nativeFullscreenRequest = null
            this.ownsNativeFullscreen = true
            if (!this.app.state.fullscreen) this.syncNativeFullscreen(false)
          }
        }, () => {
          if (this.nativeFullscreenRequest === token) this.nativeFullscreenRequest = null
        })
      } else if (active === root && (this.ownsNativeFullscreen || this.nativeFullscreenRequest)) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        if (exit) Promise.resolve(exit.call(document)).catch(() => {})
      }
    } catch {
      this.nativeFullscreenRequest = null
    }
  }

  onNativeFullscreenChange() {
    const root = document.documentElement
    const active = document.fullscreenElement || document.webkitFullscreenElement
    if (active === root) {
      if (this.app.state.fullscreen || this.nativeFullscreenRequest || this.ownsNativeFullscreen) {
        this.nativeFullscreenRequest = null
        this.ownsNativeFullscreen = true
        if (!this.app.state.fullscreen) this.syncNativeFullscreen(false)
      }
      return
    }
    if (active) return
    const owned = this.ownsNativeFullscreen
    this.ownsNativeFullscreen = false
    if (owned && this.app.state.fullscreen) this.setFullscreen(false)
  }

  onNativeFullscreenError(event) {
    if (event.target === document || event.target === document.documentElement) {
      this.nativeFullscreenRequest = null
    }
  }
}
