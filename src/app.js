import { foley } from './audio.js'
import { articleReaderScroll } from './article-reader.js'
import { CONTENT } from './content.js'
import { ASSET_META } from './assets.js'
import { COLS, REDUCED, ROWS, SRC_H, SRC_W, clamp, lerp, now } from './core.js'
import { CRT } from './crt.js'
import { syncNavigationHistory, syncNavigationMetadata, resolveNavigation } from './navigation.js'
import { PAGES } from './pages.js'
import { ROUTES, bindAssets, bindTilt, makeKey } from './panel.js'
import { Rasteriser, Terminal } from './terminal.js'

const INTERACTIVE_KEY_TARGET = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  'iframe',
  'video',
  'audio',
  '[role="button"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="link"]',
  '[role="application"]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

/* ==========================================================================
 * 8. APP
 * ======================================================================== */
export class App {
  constructor() {
    this.term = new Terminal(COLS, ROWS);
    this.raster = new Rasteriser(document.getElementById("fallback2d"));
    this.crt = new CRT(document.getElementById("gl"), this.raster.canvas);
    if (!this.crt.ok) document.getElementById("tube").classList.add("is-fallback");
    this.bindWheel(document.getElementById("tube"));

    this.state = {
      route: "home",
      cursor: 0,
      item: null,
      power: 1, powerTarget: 1,
      crt: 1, crtTarget: 1,
      fullscreen: false,
      degauss: 0, static: 0, warm: 1,
      time: 0,
      clock: "", uptime: "", available: true,
    };

    this.reveal = 0;
    this.revealTarget = 0;
    this.dirty = true;
    this.bootAt = now();
    this.lastBlip = 0;
    this.documentRuntime = null;
    // Where the raster sits inside the tube, as fractions of the tube box.
    // Normal mode stretches the picture over the whole glass; full screen
    // centres it at its own aspect (see _fitRaster).
    this.rasterRect = { x: 0, y: 0, w: 1, h: 1 };
    this.ownsNativeFullscreen = false;
    this.nativeFullscreenRequest = null;
    this.fullscreenReturnFocus = null;
    this.fullscreenFocusFrame = 0;

    this._buildKeys();
    this._bindControls();
    this._bindKeyboard();
    bindAssets();
    this.tilt = bindTilt();
    this._fit();
    addEventListener("resize", () => this._fit());
    addEventListener("popstate", () => this._restoreNavigation());
    for (const type of ["fullscreenchange", "webkitfullscreenchange"]) {
      document.addEventListener(type, () => this._onNativeFullscreenChange());
    }

    this.boot();
    requestAnimationFrame(t => this.frame(t));
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
    this.enterKey = makeKey("ENTER", "key--sm key--go");
    this.enterKey.addEventListener("click", () => this.enter());
    this.backKey = makeKey("← BACK", "key--sm");
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
      const on = this.state.powerTarget < 0.5;
      this.state.powerTarget = on ? 1 : 0;
      rocker.classList.toggle("is-on", on);
      rocker.setAttribute("aria-pressed", String(on));
      tube.classList.toggle("is-powered-off", !on);
      foley.ensure(); foley.clunk(on ? 0.85 : 0.7);
      if (on) { this.state.degauss = 1; this.state.warm = 0; foley.degauss(); foley.humOn(true); this.render(); }
      else { foley.humOn(false); }
    });
  }

  _bindKeyboard() {
    addEventListener("keydown", e => {
      const k = e.key;
      const interactive = e.target instanceof Element ? e.target.closest(INTERACTIVE_KEY_TARGET) : null;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;

      // Escape has one job at a time. In full screen it returns the chassis
      // (the browser exits native full screen on the same key, so the two
      // stay in step); only then does it mean BACK. Otherwise a reader who
      // just wanted the desk back would also be thrown out of their article.
      if (k === "Escape" && this.state.fullscreen) {
        e.preventDefault();
        this.setFullscreen(false);
        return;
      }
      // Back remains a global hardware action even when a native control owns
      // focus. Arrows and Enter still stay local to sliders, links and media.
      if (k === "Escape" || k === "Backspace") {
        e.preventDefault();
        this.backKey.tap();
        this.back();
        return;
      }
      // Mode controls keep focus for keyboard users. F works from those
      // controls too, but must not hijack text inputs or native media keys.
      const softkey = interactive?.matches('.softkeys__key');
      if ((k === 'f' || k === 'F') && (!interactive || softkey || interactive.id === 'fullscreen-switch')) {
        if (!e.repeat) { e.preventDefault(); this.toggleFullscreen(); }
        return;
      }
      // Enter/Space still activate a focused softkey natively; other terminal
      // shortcuts can drive the raster without discarding keyboard focus.
      if (interactive && (!softkey || k === 'Enter' || k === ' ')) return;

      const num = "12345".indexOf(k);
      if (num >= 0) { this.navKeys[ROUTES[num + 1].id].tap(); this.go(ROUTES[num + 1].id); return; }
      if (k === "0" || k === "h") { this.navKeys.home.tap(); this.go("home"); return; }
      if (k === "ArrowDown") {
        e.preventDefault();
        if (this.state.item) {
          if (!articleReaderScroll('line-down')) this.scrollBy(2);
        } else this.move(1);
      }
      else if (k === "ArrowUp") {
        e.preventDefault();
        if (this.state.item) {
          if (!articleReaderScroll('line-up')) this.scrollBy(-2);
        } else this.move(-1);
      }
      else if (k === "PageDown") { e.preventDefault(); if (!articleReaderScroll('down')) this.scrollBy(this.term.rows - 2); }
      else if (k === "PageUp") { e.preventDefault(); if (!articleReaderScroll('up')) this.scrollBy(-(this.term.rows - 2)); }
      else if (k === "Home" && this.state.item) { e.preventDefault(); if (!articleReaderScroll('home')) this.scrollTo(0); }
      else if (k === "End" && this.state.item) { e.preventDefault(); if (!articleReaderScroll('end')) this.scrollTo(1e9); }
      else if (k === "Enter") { e.preventDefault(); this.enterKey.tap(); this.enter(); }
      else if (k === "p" || k === "P") { document.getElementById("power").click(); }
      else if (k === "c" || k === "C") { document.getElementById("crt-switch").click(); }
    });
  }

  /* ----------------------------------------------------------- full screen
   * An accessibility mode, not a different product: the glass fills the
   * viewport and the chassis is set aside so the same 480x360 raster can be
   * read at three times its size. Native full screen is requested on top when
   * the browser allows it, but the layout never depends on it — iOS Safari
   * has no element full screen at all, and it still gets the enlarged tube.
   */
  toggleFullscreen() {
    return this.setFullscreen(!this.state.fullscreen);
  }

  setFullscreen(on) {
    on = Boolean(on);
    if (this.state.fullscreen === on) return false;
    const readingPosition = this.documentRuntime?.captureReadingPosition?.();
    if (on) this.fullscreenReturnFocus = document.activeElement;
    this.state.fullscreen = on;
    document.body.classList.toggle("is-crt-fullscreen", on);
    document.getElementById("fullscreen-switch")?.setAttribute("aria-checked", String(on));
    foley.ensure(); foley.clunk(on ? 1.15 : 0.95);
    this._syncNativeFullscreen(on);
    this._fit();
    this.documentRuntime?.restoreReadingPosition?.(readingPosition);
    cancelAnimationFrame(this.fullscreenFocusFrame);
    this.fullscreenFocusFrame = requestAnimationFrame(() => {
      if (this.state.fullscreen !== on) return;
      const previous = this.fullscreenReturnFocus;
      const target = on
        ? document.querySelector('.softkeys__key--exit')
        : previous?.isConnected && previous.getClientRects().length && previous !== document.body
          ? previous
          : document.getElementById('fullscreen-switch');
      target?.focus({ preventScroll: true });
      if (!on) this.fullscreenReturnFocus = null;
    });
    // The raster re-registers on a different geometry; a short burst of
    // static sells the retrace instead of an instant cut.
    this.state.static = Math.max(this.state.static, 0.55);
    this.dirty = true;
    return true;
  }

  _syncNativeFullscreen(on) {
    const root = document.documentElement;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (on) {
        if (active || this.nativeFullscreenRequest) return;
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!request) return;
        const token = {};
        this.nativeFullscreenRequest = token;
        Promise.resolve(request.call(root, { navigationUI: "hide" })).then(() => {
          if (this.nativeFullscreenRequest !== token) return;
          this.nativeFullscreenRequest = null;
          const current = document.fullscreenElement || document.webkitFullscreenElement;
          if (current === root) {
            this.ownsNativeFullscreen = true;
            // A rapid second press can leave CSS mode before the browser
            // finishes entering. Undo that late native entry as well.
            if (!this.state.fullscreen) this._syncNativeFullscreen(false);
          }
        }, () => {
          if (this.nativeFullscreenRequest === token) this.nativeFullscreenRequest = null;
        });
      } else if (active === root && (this.ownsNativeFullscreen || this.nativeFullscreenRequest)) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) Promise.resolve(exit.call(document)).catch(() => {});
      }
    } catch {
      this.nativeFullscreenRequest = null;
      // Refused (no user gesture, iframe policy) or unsupported: the CSS
      // layout mode is already applied, which is the part that matters.
    }
  }

  _onNativeFullscreenChange() {
    const root = document.documentElement;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active === root) {
      if (this.state.fullscreen || this.nativeFullscreenRequest || this.ownsNativeFullscreen) {
        this.ownsNativeFullscreen = true;
        if (!this.state.fullscreen) this._syncNativeFullscreen(false);
      }
      return;
    }
    if (active) return;                     // e.g. an embedded video's own full screen
    // The browser left native full screen on its own (Esc, F11, system UI).
    // Follow it, but only when it was ours: an embed exiting its full screen
    // on iOS must not throw the reader out of the enlarged tube.
    const owned = this.ownsNativeFullscreen;
    this.ownsNativeFullscreen = false;
    if (owned && this.state.fullscreen) this.setFullscreen(false);
  }

  _fit() {
    const machine = document.getElementById("machine");

    // The 941x1672 chassis is an authored portrait composition. Selecting it
    // merely because a phone is narrow collapses it to unreadable scale in
    // landscape; landscape viewports use the horizontal desktop composition.
    const compact = innerWidth / innerHeight < 1.05;
    machine.classList.toggle("is-compact", compact);
    document.body.classList.toggle("is-compact-stage", compact);

    const dw = compact ? 941 : 1920;
    const dh = compact ? 1672 : 1080;
    const fit = compact
      ? Math.min(innerWidth / dw, innerHeight / dh)
      : Math.max(innerWidth / dw, innerHeight / dh);
    const root = document.documentElement.style;
    root.setProperty("--fit", fit.toFixed(4));

    if (compact) {
      const renderedWidth = dw * fit;
      const renderedHeight = dh * fit;
      const gapX = Math.max(0, (innerWidth - renderedWidth) * 0.5);
      const gapY = Math.max(0, (innerHeight - renderedHeight) * 0.5);
      root.setProperty("--compact-render-w", `${renderedWidth}px`);
      root.setProperty("--compact-render-h", `${renderedHeight}px`);
      root.setProperty("--compact-gap-x", `${gapX}px`);
      root.setProperty("--compact-gap-y", `${gapY}px`);
    } else {
      root.removeProperty("--compact-render-w");
      root.removeProperty("--compact-render-h");
      root.removeProperty("--compact-gap-x");
      root.removeProperty("--compact-gap-y");
    }

    if (this.crt.ok) {
      const tube = document.getElementById("tube");
      this.crt.resize(tube.offsetWidth || 740, tube.offsetHeight || 576,
                      Math.min(devicePixelRatio || 1, 2));
    }
    this._fitRaster(compact);
  }

  /**
   * Places the raster on the glass. On the desk the picture is stretched over
   * the whole aperture, as it always was. Full screen keeps the 480x360 aspect
   * and centres it: the shader gets the rectangle as a uniform, and the DOM
   * layers that must register with the picture (semantic reader, contact
   * anchors, inline integrations, CRT-off canvases) get the same rectangle as
   * custom properties. Those layers keep their desk-size layout and are
   * scaled, so wrapping and hit geometry stay identical to normal mode.
   */
  _fitRaster(compact) {
    const tube = document.getElementById("tube");
    const style = tube.style;
    let rect = { x: 0, y: 0, w: 1, h: 1 };

    if (this.state.fullscreen) {
      const vw = tube.offsetWidth || innerWidth || 1;
      const vh = tube.offsetHeight || innerHeight || 1;
      const scale = Math.min(vw / SRC_W, vh / SRC_H);
      const w = SRC_W * scale, h = SRC_H * scale;
      rect = { x: (vw - w) / 2 / vw, y: (vh - h) / 2 / vh, w: w / vw, h: h / vh };

      // The desk tube's width, from the same aperture and bleed CSS uses, so
      // the semantic layers wrap exactly as they do on the desk. Height is
      // 3:4 of that: the layers must map 1:1 onto the displayed raster.
      const machine = document.getElementById("machine");
      const ap = compact ? ASSET_META.mobile_chassis.aperture : ASSET_META.chassis.aperture;
      const bleed = parseFloat(getComputedStyle(machine).getPropertyValue("--tube-bleed-x")) || 0;
      const baseW = Math.max(1, (ap[2] - ap[0]) * (compact ? 941 : 1920) + bleed * 2);
      const baseH = baseW * (SRC_H / SRC_W);
      style.setProperty("--raster-x", `${(rect.x * 100).toFixed(4)}%`);
      style.setProperty("--raster-y", `${(rect.y * 100).toFixed(4)}%`);
      style.setProperty("--raster-base-w", `${baseW.toFixed(3)}px`);
      style.setProperty("--raster-base-h", `${baseH.toFixed(3)}px`);
      style.setProperty("--raster-k", (w / baseW).toFixed(5));
    } else {
      for (const name of ["--raster-x", "--raster-y", "--raster-base-w", "--raster-base-h", "--raster-k"]) {
        style.removeProperty(name);
      }
    }

    this.rasterRect = rect;
    this.crt.setRaster?.(rect.x, rect.y, rect.w, rect.h);
  }

  /** Tube-relative rectangle of the raster in client pixels. */
  rasterClientRect() {
    const rect = document.getElementById("tube").getBoundingClientRect();
    const r = this.rasterRect;
    return {
      left: rect.left + rect.width * r.x,
      top: rect.top + rect.height * r.y,
      width: rect.width * r.w,
      height: rect.height * r.h,
    };
  }

  attachDocumentRuntime(runtime) {
    if (!runtime || this.documentRuntime === runtime) return runtime;
    if (this.documentRuntime) this.documentRuntime.destroy?.();
    this.documentRuntime = runtime;
    runtime.syncSource?.();
    this.dirty = true;
    return runtime;
  }

  detachDocumentRuntime(runtime) {
    if (runtime && this.documentRuntime !== runtime) return;
    this.documentRuntime = null;
    this.dirty = true;
  }

  _commitNavigation(mode = "push", extraState = {}) {
    syncNavigationHistory(this.state, mode, extraState);
    syncNavigationMetadata(this.state);
  }

  _restoreNavigation() {
    if (this.booting) return;
    const target = resolveNavigation(CONTENT);
    this.state.route = target.route;
    this.state.item = target.item;
    this.state.cursor = target.cursor;
    this.state.static = 0.8;
    this.render(true);
    this._syncKeys();
    syncNavigationMetadata(this.state);
    if (!target.valid) syncNavigationHistory(this.state, "replace");
  }

  go(route, { historyMode = "push" } = {}) {
    foley.ensure();
    if (this.state.route === route && !this.state.item) return;
    this.state.route = route;
    this.state.item = null;
    if (route === "projects" || route === "articles") this.state.cursor = 0;
    this.state.static = 1;
    foley.sweep();
    this.render(true);
    this._syncKeys();
    this._commitNavigation(historyMode);
  }

  scrollBy(rows) {
    if (!this.term || !this.term.maxScroll) return;
    if (this.term.scrollBy(rows)) { foley.blip && foley.blip(); this.render(false); }
  }

  scrollTo(rows) {
    if (!this.term) return;
    this.term.scroll = 0;
    this.scrollBy(rows);
  }

  bindWheel(el) {
    el.addEventListener("wheel", e => {
      if (e.target.closest && e.target.closest('.article-reader')) return;
      if (!this.term || !this.term.maxScroll) return;
      e.preventDefault();
      this.scrollBy(Math.sign(e.deltaY) * 2);
    }, { passive: false });
  }

  move(d) {
    const st = this.state;
    if (st.item) {
      const arr = st.route === "projects" ? CONTENT.projects : CONTENT.articles;
      const i = clamp(arr.indexOf(st.item) + d, 0, arr.length - 1);
      st.item = arr[i]; st.cursor = i;
      st.static = 0.6; foley.sweep(); this.render(true);
      this._commitNavigation("replace");
      return;
    }
    if (st.route !== "projects" && st.route !== "articles") return;
    const arr = st.route === "projects" ? CONTENT.projects : CONTENT.articles;
    st.cursor = clamp(st.cursor + d, 0, arr.length - 1);
    foley.blip();
    this.render();
    this._commitNavigation("replace");
  }

  enter() {
    const st = this.state;
    if (st.route === "projects" || st.route === "articles") {
      if (st.item) return;
      const arr = st.route === "projects" ? CONTENT.projects : CONTENT.articles;
      const parentPath = `/${st.route}`;
      st.item = arr[st.cursor];
      st.static = 1; foley.sweep();
      this.render(true);
      this._commitNavigation("push", { parentPath });
    } else if (st.route === "home") {
      this.navKeys.projects.tap(); this.go("projects");
    }
  }

  back() {
    if (this.documentRuntime?.handleBack?.()) return;

    const st = this.state;
    if (st.item) {
      const expectedParent = `/${st.route}`;
      if (history.state?.parentPath === expectedParent && history.length > 1) {
        history.back();
        return;
      }

      // A deep link has no in-app collection entry to return to, so replace it
      // with the collection rather than synthesising a duplicate history step.
      st.item = null;
      st.static = 0.8;
      foley.sweep();
      this.render(true);
      this._commitNavigation("replace");
      return;
    }
    if (st.route !== "home") {
      this.navKeys.home.tap();
      this.go("home", { historyMode: "replace" });
    }
  }

  _syncKeys() {
    for (const r of ROUTES) this.navKeys[r.id].classList.toggle("is-on", r.id === this.state.route);
  }

  render(retype = false) {
    const st = this.state;
    const keepScroll = this.term.scroll;
    this.term.clear();

    const documentItem = (st.route === 'articles' || st.route === 'projects') && st.item
      ? st.item
      : null;

    if (documentItem) {
      this.term.put(4, 3, documentItem.label.slice(0, this.term.cols - 8), "bright");
      if (documentItem.sub) this.term.put(4, 5, documentItem.sub.slice(0, this.term.cols - 8), "dim");
      this.term.put(4, 7, "DOCUMENT VIEW ACTIVE", "mid");
    } else {
      const page = PAGES[st.route] || PAGES.home;
      page(this.term, st);
    }

    this.documentRuntime?.syncSource?.();

    this.term.scroll = retype ? 0 : Math.min(keepScroll, this.term.maxScroll);
    this.total = this.term.countGlyphs();
    if (retype) { this.reveal = 0; this._announce(); }
    this.revealTarget = this.total;
    this.dirty = true;
  }

  _announce() {
    const lines = [];
    for (let y = 0; y < this.term.docRows; y++) {
      let s = "";
      for (let x = 0; x < this.term.cols; x++) {
        const c = this.term.cells[y * this.term.cols + x];
        s += c ? c.ch : " ";
      }
      s = s.replace(/[─│┌┐└┘├┤┬┴┼█▓▒░▸▶]/g, " ").trimEnd();
      if (s.trim()) lines.push(s.trim());
    }
    document.getElementById("live").textContent = lines.join(". ");
  }

  boot() {
    const t = this.term;
    t.clear();
    this.state.route = "boot";
    const lines = [
      "JG-1500 TERMINAL — FIRMWARE 2.6.1",
      "",
      "MEMORY CHECK ............ 640K OK",
      "PHOSPHOR ................ P1 GREEN",
      "DEFLECTION COILS ........ NOMINAL",
      "GLYPH ROM ............... 8x14 LOADED",
      "PORTFOLIO IMAGE ......... MOUNTED",
      "",
      "READY.",
    ];
    lines.forEach((l, i) => t.put(4, 3 + i, l, i === 0 ? "bright" : "mid"));
    this.total = t.countGlyphs();
    this.reveal = 0; this.revealTarget = this.total;
    this.booting = true;
    this.dirty = true;
    foley.humOn(true);
    foley.degauss(); this.state.degauss = 1;
    setTimeout(() => {
      this.booting = false;
      this._restoreNavigation();
    }, REDUCED ? 80 : 1200);
  }

  frame(ms) {
    const st = this.state;
    const t = ms / 1000;
    const dt = Math.min(0.05, t - (this._last || t));
    this._last = t;
    st.time = t;

    st.power = lerp(st.power, st.powerTarget, 1 - Math.pow(0.001, dt * 1.6));
    st.crt = lerp(st.crt, st.crtTarget, 1 - Math.pow(0.001, dt * 3));
    st.degauss = Math.max(0, st.degauss - dt * 0.9);
    st.static = Math.max(0, st.static - dt * 4.5);
    st.warm = Math.min(1, st.warm + dt * 0.55);

    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const up = Math.max(0, Math.floor(t - this.bootAt));
    const uptime = `${pad(Math.floor(up / 3600))}:${pad(Math.floor(up / 60) % 60)}:${pad(up % 60)}`;
    if (clock !== st.clock) {
      st.clock = clock;
      st.uptime = uptime;
      if (!this.booting && st.route === "home" && !st.item) this.render();
    }

    if (this.reveal < this.revealTarget) {
      const speed = REDUCED ? 100000 : (this.booting ? 360 : 900);
      const before = Math.floor(this.reveal);
      this.reveal = Math.min(this.revealTarget, this.reveal + speed * dt);
      if (Math.floor(this.reveal) !== before) {
        this.dirty = true;
        if (!REDUCED && t - this.lastBlip > 0.028) { foley.blip(0.18); this.lastBlip = t; }
      }
    }

    const blink = Math.floor(t * 2) % 2 === 0;
    if (blink !== this._blink) {
      this._blink = blink;
      if (!this.documentRuntime?.isDocument?.()) this.dirty = true;
    }

    this.tilt?.frame?.();
    this.documentRuntime?.frame?.(ms);

    const sourceDirty = this.dirty;
    if (sourceDirty) {
      const handled = this.documentRuntime?.paint?.(Math.floor(this.reveal)) || false;
      if (!handled) {
        this.raster.paint(
          this.term,
          Math.floor(this.reveal),
          blink && this.reveal >= this.revealTarget,
        );
      }
    }

    // CRT owns the visible WebGL canvas and composites every frame for
    // persistence, scanlines, degauss/static and power-collapse animation.
    // `sourceDirty` only controls whether the active source texture is uploaded.
    if (this.crt.ok) this.crt.render(st, sourceDirty);
    this.dirty = false;

    requestAnimationFrame(n => this.frame(n));
  }
}

export function start() { return new App(); }
