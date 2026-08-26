import { foley } from './audio.js'
import { articleReaderScroll, syncArticleReader } from './article-reader.js'
import { CONTENT } from './content.js'
import { COLS, REDUCED, ROWS, clamp, lerp, now } from './core.js'
import { CRT } from './crt.js'
import { PAGES } from './pages.js'
import { ROUTES, bindAssets, bindMobileMenu, bindTilt, makeKey } from './panel.js'
import { Rasteriser, Terminal } from './terminal.js'

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
      degauss: 0, static: 0, warm: 1,
      time: 0,
      clock: "", uptime: "", available: true,
    };

    this.reveal = 0;
    this.revealTarget = 0;
    this.dirty = true;
    this.bootAt = now();
    this.lastBlip = 0;

    this._buildKeys();
    this._bindControls();
    this._bindKeyboard();
    bindAssets();
    bindMobileMenu();
    bindTilt();
    this._fit();
    addEventListener("resize", () => this._fit());

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
      if (e.target.tagName === "INPUT") return;
      const k = e.key;
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
      else if (k === "Escape" || k === "Backspace") { e.preventDefault(); this.backKey.tap(); this.back(); }
      else if (k === "p" || k === "P") { document.getElementById("power").click(); }
      else if (k === "c" || k === "C") { document.getElementById("crt-switch").click(); }
    });
  }

  _fit() {
    const machine = document.getElementById("machine");
    const compact = innerWidth < 980 || innerWidth / innerHeight < 1.05;
    machine.classList.toggle("is-compact", compact);
    document.body.classList.toggle("is-compact-stage", compact);

    const dw = compact ? 941 : 1920;
    const dh = compact ? 1672 : 1080;
    const fit = compact
      ? Math.max(innerWidth / dw, innerHeight / dh)
      : Math.max(innerWidth / dw, innerHeight / dh);
    document.documentElement.style.setProperty("--fit", fit.toFixed(4));

    if (this.crt.ok) {
      const tube = document.getElementById("tube");
      this.crt.resize(tube.offsetWidth || 740, tube.offsetHeight || 576,
                      Math.min(devicePixelRatio || 1, 2));
    }
  }

  go(route) {
    foley.ensure();
    if (this.state.route === route && !this.state.item) return;
    this.state.route = route;
    this.state.item = null;
    if (route === "projects" || route === "articles") this.state.cursor = 0;
    this.state.static = 1;
    foley.sweep();
    this.render(true);
    this._syncKeys();
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
      return;
    }
    if (st.route !== "projects" && st.route !== "articles") return;
    const arr = st.route === "projects" ? CONTENT.projects : CONTENT.articles;
    st.cursor = clamp(st.cursor + d, 0, arr.length - 1);
    foley.blip();
    this.render();
  }

  enter() {
    const st = this.state;
    if (st.route === "projects" || st.route === "articles") {
      if (st.item) return;
      const arr = st.route === "projects" ? CONTENT.projects : CONTENT.articles;
      st.item = arr[st.cursor];
      st.static = 1; foley.sweep();
      this.render(true);
    } else if (st.route === "home") {
      this.navKeys.projects.tap(); this.go("projects");
    }
  }

  back() {
    const st = this.state;
    if (st.item) { st.item = null; st.static = 0.8; foley.sweep(); this.render(true); return; }
    if (st.route !== "home") { this.navKeys.home.tap(); this.go("home"); }
  }

  _syncKeys() {
    for (const r of ROUTES) this.navKeys[r.id].classList.toggle("is-on", r.id === this.state.route);
  }

  render(retype = false) {
    const st = this.state;
    const keepScroll = this.term.scroll;
    this.term.clear();

    // Project/article details are owned by the document runtime. Do not also
    // render their authored blocks into the hidden terminal buffer: doing so
    // would instantiate a second set of local videos through pages.js/media.js.
    const documentItem = (st.route === 'articles' || st.route === 'projects') && st.item
      ? st.item
      : null;

    if (documentItem) {
      this.term.put(4, 3, documentItem.label.slice(0, this.term.cols - 8), "bright");
      if (documentItem.sub) this.term.put(4, 5, documentItem.sub.slice(0, this.term.cols - 8), "dim");
      this.term.put(4, 7, "DOCUMENT VIEW ACTIVE", "mid");
    } else {
      const page = st.item ? PAGES.detail : (PAGES[st.route] || PAGES.home);
      page(this.term, st);
    }

    // Articles and projects are both long-form documents now. The same DOM
    // mirror supplies semantics, native media elements and scroll state while
    // the visible pixels continue to come from the raster/CRT pipeline.
    syncArticleReader(documentItem);
    document.getElementById('tube').classList.toggle('is-reading', Boolean(documentItem));

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
    this.reveal = 0;
    this.revealTarget = this.total;
    this.dirty = true;
    this.booting = true;
    this.state.warm = 0;
    this.state.degauss = 1;
    setTimeout(() => {
      this.booting = false;
      this.go("home");
      this._syncKeys();
      const hint = document.getElementById("hint");
      setTimeout(() => { hint.style.opacity = "0"; }, 6000);
    }, REDUCED ? 400 : 2400);
  }

  frame(ms) {
    requestAnimationFrame(t => this.frame(t));
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
    const up = Math.floor(t - (this.bootAt ? 0 : 0));
    const uptime = `${pad(Math.floor(up / 3600))}:${pad(Math.floor(up / 60) % 60)}:${pad(up % 60)}`;
    if (clock !== st.clock) {
      st.clock = clock; st.uptime = uptime;
      if (!this.booting && st.route === "home" && !st.item) this.render();
    }

    if (this.reveal < this.revealTarget) {
      const speed = REDUCED ? 100000 : 900;
      const before = Math.floor(this.reveal);
      this.reveal = Math.min(this.revealTarget, this.reveal + speed * dt);
      if (Math.floor(this.reveal) !== before) {
        this.dirty = true;
        if (t - this.lastBlip > 0.028) { foley.blip(); this.lastBlip = t; }
      }
    }

    const blink = Math.floor(t * 2) % 2 === 0;
    if (blink !== this._blink) { this._blink = blink; this.dirty = true; }

    if (this.dirty) {
      this.raster.paint(this.term, Math.floor(this.reveal), blink && this.reveal >= this.revealTarget);
    }

    if (this.crt.ok) this.crt.render(st, this.dirty);
    this.dirty = false;
  }
}

let instance = null;
export const start = () => (instance ||= new App());