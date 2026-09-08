import { clamp, SRC_H, SRC_W } from './core.js'
import { CONTENT } from './content.js'
import { foley } from './audio.js'
import { ROUTES, makeKey, bindAssets, bindTilt } from './panel.js'
import { ICONS } from './icons.js'
import { TerminalRasteriser } from './terminal-rasteriser.js'
import { CrtRenderer } from './crt.js'
import { ArticleRasteriser } from './document/article-rasteriser.js'
import { createDocumentRuntime } from './document/runtime.js'
import { installLandscapeMobileLayout } from './landscape-mobile.js'
import { installRuntimeControls } from './runtime-controls.js'

export class App {
  constructor() {
    this.state = {
      route: 'home',
      cursor: 0,
      item: null,
      fullscreen: false,
      powerTarget: 1,
      crtTarget: 1,
    }

    this.volume = .35
    this.rasterRect = { x: 0, y: 0, w: 1, h: 1 }
    this.dirty = true
    this.destroyed = false

    bindAssets()
    this._buildKeys()
    this._bindControls()

    this.raster = new TerminalRasteriser(document.getElementById('fallback2d'))
    this.articleRaster = new ArticleRasteriser(document.getElementById('article-source'))
    this.crt = new CrtRenderer(document.getElementById('gl'))
    this.documentRuntime = createDocumentRuntime(this)

    this.tilt = bindTilt()
    this.cleanupRuntimeControls = installRuntimeControls(this)
    this.cleanupLandscapeLayout = installLandscapeMobileLayout(this)

    this._bindKeyboard()
    this._bindHistory()
    this._bindResize()
    this._restoreRoute(location.pathname, false)
    this._fit()
    this._frame = this._frame.bind(this)
    requestAnimationFrame(this._frame)
  }

  destroy() {
    this.destroyed = true
    this.cleanupLandscapeLayout?.()
    this.cleanupRuntimeControls?.()
    this.documentRuntime?.destroy?.()
    this.tilt?.destroy?.()
    this.crt?.destroy?.()
  }

  _frame(time) {
    if (this.destroyed) return
    this.tilt?.frame?.()
    this.crt.frame(time, this)
    requestAnimationFrame(this._frame)
  }

  /* ---------------------------------------------------------------- setup */
  _buildKeys() {
    const nav = document.getElementById("nav-keys");
    this.navKeys = {};
    for (const r of ROUTES) {
      const k = makeKey(r.label, '', r.icon);
      k.setAttribute("aria-label", r.label);
      k.addEventListener("click", () => this.go(r.id));
      nav.appendChild(k);
      this.navKeys[r.id] = k;
    }

    const act = document.getElementById("action-keys");
    this.enterKey = makeKey("ENTER", "key--sm key--go", ICONS.enter);
    this.enterKey.addEventListener("click", () => this.enter());
    this.backKey = makeKey("BACK", "key--sm", ICONS.back);
    this.backKey.addEventListener("click", () => this.back());
    act.appendChild(this.enterKey);
    act.appendChild(this.backKey);
  }

  _bindControls() {
    const sw = document.getElementById("crt-switch");
    sw.addEventListener("click", () => {
      const on = sw.getAttribute("aria-checked") !== "true";
      sw.setAttribute("aria-checked", String(on));
      this.state.crtTarget = on ? 1 : 0;
      document.getElementById("tube").classList.toggle("is-crt-off", !on);
      foley.ensure(); foley.clunk(1.4);
    });

    const fs = document.getElementById("fullscreen-switch");
    fs?.addEventListener("click", () => this.toggleFullscreen());

    const slider = document.getElementById("volume");
    const thumb = document.getElementById("volume-thumb");
    const set = (v) => {
      v = clamp(v, 0, 1);
      this.volume = v;
      thumb.style.left = (8 + v * (slider.clientWidth - 16)) + "px";
      slider.setAttribute("aria-valuenow", Math.round(v * 100));
      foley.setVolume(v * 0.7);
    };
    const fromEvent = (e) => {
      const r = slider.getBoundingClientRect();
      const scale = r.width / slider.offsetWidth;
      return ((e.clientX - r.left) / scale - 8) / (slider.offsetWidth - 16);
    };
    slider.addEventListener("pointerdown", e => {
      foley.ensure();
      slider.setPointerCapture?.(e.pointerId);
      slider.dataset.drag = "1"; set(fromEvent(e));
    });
    slider.addEventListener("pointermove", e => { if (slider.dataset.drag) set(fromEvent(e)); });
    const stop = () => { delete slider.dataset.drag; };
    slider.addEventListener("pointerup", stop);
    slider.addEventListener("pointercancel", stop);
    slider.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { set(this.volume - 0.05); e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { set(this.volume + 0.05); e.preventDefault(); }
    });
    requestAnimationFrame(() => set(0.35));

    const rocker = document.getElementById("power");
    const tube = document.getElementById("tube");
    const initiallyOn = this.state.powerTarget >= 0.5;
    rocker.classList.toggle("is-on", initiallyOn);
    rocker.setAttribute("aria-pressed", String(initiallyOn));
    tube.classList.toggle("is-powered-off", !initiallyOn);
    rocker.addEventListener("click", () => {
      const on = !rocker.classList.contains("is-on");
      rocker.classList.toggle("is-on", on);
      rocker.setAttribute("aria-pressed", String(on));
      this.state.powerTarget = on ? 1 : 0;
      tube.classList.toggle("is-powered-off", !on);
      foley.ensure(); foley.clunk(1.9);
      this.dirty = true;
    });
  }

  _bindKeyboard() {
    addEventListener('keydown', event => {
      if (event.defaultPrevented) return

      if (event.key === 'f' || event.key === 'F') {
        this.toggleFullscreen()
        event.preventDefault()
        return
      }
      if (event.key === 'p' || event.key === 'P') {
        document.getElementById('power')?.click()
        event.preventDefault()
        return
      }
      if (event.key === 'c' || event.key === 'C') {
        document.getElementById('crt-switch')?.click()
        event.preventDefault()
        return
      }

      if (this.documentRuntime?.handleKey?.(event)) return

      if (event.key === 'Escape') {
        if (this.state.fullscreen) this.toggleFullscreen(false)
        else this.back()
        event.preventDefault()
        return
      }

      if (event.key === 'Enter') {
        this.enter()
        event.preventDefault()
        return
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const route = this.state.route
        if (route !== 'projects' && route !== 'articles') return
        const items = route === 'projects' ? CONTENT.projects : CONTENT.articles
        if (!items.length) return
        const delta = event.key === 'ArrowUp' ? -1 : 1
        this.state.cursor = (this.state.cursor + delta + items.length) % items.length
        this.render()
        event.preventDefault()
      }
    })
  }

  _bindHistory() {
    addEventListener('popstate', () => this._restoreRoute(location.pathname, false))
  }

  _bindResize() {
    let queued = false
    const fit = () => {
      queued = false
      this._fit()
    }
    addEventListener('resize', () => {
      if (queued) return
      queued = true
      requestAnimationFrame(fit)
    })
  }

  _restoreRoute(pathname, push = false) {
    const segments = pathname.split('/').filter(Boolean)
    const route = segments[0] || 'home'
    const item = segments[1] || null
    const validRoute = ROUTES.some(entry => entry.id === route)
    this.state.route = validRoute ? route : 'home'
    this.state.item = validRoute ? item : null
    this.state.cursor = 0

    if (push) history.pushState({}, '', pathname)
    this.render()
  }

  go(route) {
    if (!ROUTES.some(entry => entry.id === route)) return
    this._restoreRoute(route === 'home' ? '/' : `/${route}`, true)
  }

  enter() {
    if (this.state.item) return
    const route = this.state.route
    if (route !== 'projects' && route !== 'articles') return
    const items = route === 'projects' ? CONTENT.projects : CONTENT.articles
    const item = items[this.state.cursor]
    if (!item) return
    this._restoreRoute(`/${route}/${item.slug}`, true)
  }

  back() {
    if (this.state.item) {
      this._restoreRoute(`/${this.state.route}`, true)
      return
    }
    if (this.state.route !== 'home') this.go('home')
  }

  render() {
    for (const [id, key] of Object.entries(this.navKeys)) key.classList.toggle('is-on', id === this.state.route)

    const route = ROUTES.find(entry => entry.id === this.state.route)
    const content = this.state.item
      ? CONTENT[this.state.route]?.find(entry => entry.slug === this.state.item)
      : CONTENT[this.state.route]

    if (this.state.item && content) {
      this.documentRuntime?.render?.(this.state.route, content)
    } else {
      this.documentRuntime?.clear?.()
      this.raster.render(this.state, CONTENT)
    }

    document.getElementById('live').textContent = route?.label || this.state.route
    this._fitRaster()
    this.dirty = true
  }

  _fit() {
    const compact = innerWidth / innerHeight < 1.05
    const designWidth = compact ? 941 : 1920
    const designHeight = compact ? 1672 : 1080
    const fit = compact
      ? Math.min(innerWidth / designWidth, innerHeight / designHeight)
      : Math.max(innerWidth / designWidth, innerHeight / designHeight)

    document.documentElement.style.setProperty('--fit', fit)
    const machine = document.getElementById('machine')
    machine.classList.toggle('is-compact', compact)
    document.body.classList.toggle('is-compact-stage', compact)
    this._fitRaster()
  }

  _fitRaster() {
    const tube = document.getElementById('tube')
    const compact = document.getElementById('machine')?.classList.contains('is-compact')
    const width = tube?.offsetWidth || SRC_W
    const height = tube?.offsetHeight || SRC_H
    const fit = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1
    const pixelWidth = compact ? Math.max(1, Math.floor(width * fit * Math.min(devicePixelRatio || 1, 2))) : SRC_W
    const pixelHeight = compact ? Math.max(1, Math.floor(height * fit * Math.min(devicePixelRatio || 1, 2))) : SRC_H

    this.raster.setViewport({ width, height, documentWidth: width, documentHeight: height, documentBottom: 0, textScale: 1, physicalDocumentScale: fit })
    this.crt.resize(pixelWidth, pixelHeight, 1)
    this.rasterRect = { x: 0, y: 0, w: 1, h: 1 }
    this.documentRuntime?.setViewport?.({ width, height, documentWidth: width, documentHeight: height, documentBottom: 0, textScale: 1, physicalDocumentScale: fit })
    this.dirty = true
  }

  rasterClientRect() {
    const tube = document.getElementById('tube')
    if (!tube) return null
    const rect = tube.getBoundingClientRect()
    const raster = this.rasterRect || { x: 0, y: 0, w: 1, h: 1 }
    return {
      left: rect.left + rect.width * raster.x,
      top: rect.top + rect.height * raster.y,
      right: rect.left + rect.width * (raster.x + raster.w),
      bottom: rect.top + rect.height * (raster.y + raster.h),
      width: rect.width * raster.w,
      height: rect.height * raster.h,
    }
  }

  async toggleFullscreen(force) {
    const next = typeof force === 'boolean' ? force : !this.state.fullscreen
    if (next === this.state.fullscreen) return

    this.state.fullscreen = next
    const body = document.body
    const switchControl = document.getElementById('fullscreen-switch')
    switchControl?.setAttribute('aria-checked', String(next))

    if (next) {
      body.classList.add('is-crt-fullscreen')
      this.documentRuntime?.beforeFullscreen?.()
      try {
        await document.documentElement.requestFullscreen?.()
      } catch {
        // CSS-only fullscreen remains the supported fallback.
      }
    } else {
      body.classList.remove('is-crt-fullscreen')
      if (document.fullscreenElement) {
        try { await document.exitFullscreen() } catch { /* CSS-only state is already restored. */ }
      }
      this.documentRuntime?.afterFullscreen?.()
    }

    this._fit()
    this.dirty = true
  }
}
