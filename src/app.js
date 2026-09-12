import { fullscreenLayout } from './fullscreen-layout.js'
import { aspectRatio, fittedRect } from './layout-engine.js'
import { COLS, ROWS, SRC_H, SRC_W, now } from './core.js'
import { CRT } from './crt.js'
import { bindAssets, bindTilt } from './panel.js'
import { Rasteriser, Terminal } from './terminal.js'
import { InputController } from './controllers/input-controller.js'
import { MachineStateController } from './controllers/machine-state-controller.js'
import { NavigationController } from './controllers/navigation-controller.js'
import { RenderController } from './controllers/render-controller.js'

/* ==========================================================================
 * 8. APP
 * ======================================================================== */
export class App {
  constructor() {
    this.term = new Terminal(COLS, ROWS);
    this.raster = new Rasteriser(document.getElementById("fallback2d"));
    this.crt = new CRT(document.getElementById("gl"), this.raster.canvas);
    if (!this.crt.ok) document.getElementById("tube").classList.add("is-fallback");

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
    // Terminal-grid hit geometry, as fractions of the tube box. Fullscreen
    // documents and pixel surfaces cover the entire viewport (see _fitRaster).
    this.rasterRect = { x: 0, y: 0, w: 1, h: 1 };

    // App stays the composition root. Controllers receive the already-created
    // runtime instead of importing App, which keeps dependencies one-way.
    this.machineController = new MachineStateController(this);
    this.navigationController = new NavigationController(this);
    this.inputController = new InputController(this, this.machineController);
    this.renderController = new RenderController(this);
    this.machineController.install();
    this.inputController.install();
    this.navigationController.install();
    bindAssets();
    this.tilt = bindTilt();
    this._fit();
    addEventListener("resize", () => this._fit());
    this.renderController.start();
  }

  toggleFullscreen() {
    return this.machineController.toggleFullscreen();
  }

  setFullscreen(on) {
    return this.machineController.setFullscreen(on);
  }

  _syncNativeFullscreen(on) {
    return this.machineController.syncNativeFullscreen(on);
  }

  _onNativeFullscreenChange() {
    return this.machineController.onNativeFullscreenChange();
  }

  _fit({ forceCompact = false } = {}) {
    const machine = document.getElementById("machine");
    const viewportWidth = innerWidth || 1;
    const viewportHeight = innerHeight || 1;

    // The 941x1672 chassis is an authored portrait composition. Selecting it
    // merely because a phone is narrow collapses it to unreadable scale in
    // landscape; landscape viewports use the horizontal desktop composition.
    const compact = forceCompact || aspectRatio(viewportWidth, viewportHeight) < 1.05;
    machine.classList.toggle("is-compact", compact);
    document.body.classList.toggle("is-compact-stage", compact);

    const dw = compact ? 941 : 1920;
    const dh = compact ? 1672 : 1080;
    const composition = fittedRect(viewportWidth, viewportHeight, dw, dh, compact ? 'contain' : 'cover');
    const fit = composition.scale;
    const root = document.documentElement.style;
    root.setProperty("--fit", fit.toFixed(4));

    if (compact) {
      const renderedWidth = composition.width;
      const renderedHeight = composition.height;
      const gapX = composition.gapX;
      const gapY = composition.gapY;
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

    // Fullscreen owns its bounded resolution below. Do not allocate an
    // uncapped intermediate buffer (e.g. 8K at devicePixelRatio 2) first.
    if (this.crt.ok && !this.state.fullscreen) {
      const tube = document.getElementById("tube");
      this.crt.resize(tube.offsetWidth || 740, tube.offsetHeight || 576,
                      Math.min(devicePixelRatio || 1, 2));
    }
    this._fitRaster();
  }

  // Fullscreen providers paint the complete viewport. Only the terminal's
  // fixed grid is centred; documents reflow and media retain their own aspect.
  _fitRaster() {
    const tube = document.getElementById("tube");
    const style = tube.style;
    let rect = { x: 0, y: 0, w: 1, h: 1 };

    if (this.state.fullscreen) {
      const vw = tube.offsetWidth || innerWidth || 1;
      const vh = tube.offsetHeight || innerHeight || 1;
      const layout = fullscreenLayout(vw, vh, devicePixelRatio || 1, document.getElementById('softkeys')?.offsetHeight || 0, this.crt.maxDimension);
      const picture = layout.terminal;
      const documentMode = Boolean(this.state.item);
      if (!documentMode) rect = { x: picture.x / vw, y: picture.y / vh, w: picture.width / vw, h: picture.height / vh };
      this.raster.setViewport(layout);
      this.crt.resize(layout.pixelWidth, layout.pixelHeight, 1);
      style.setProperty("--raster-x", `${(rect.x * 100).toFixed(4)}%`);
      style.setProperty("--raster-y", `${(rect.y * 100).toFixed(4)}%`);
      style.setProperty("--raster-base-w", `${SRC_W}px`);
      style.setProperty("--raster-base-h", `${SRC_H}px`);
      style.setProperty("--raster-k", (picture.width / SRC_W).toFixed(5));
      style.setProperty('--fullscreen-bottom', `${layout.bottom}px`);
      style.setProperty('--document-column', `${Math.min(520, layout.documentWidth - (layout.documentWidth < SRC_W ? 40 : 84)) * layout.textScale}px`);
      style.setProperty('--document-scale', layout.textScale);
      // Restore reading progress only after all DOM geometry is published.
      this.documentRuntime?.setViewport?.(layout);
    } else {
      this.raster.setViewport(null);
      for (const name of ["--raster-x", "--raster-y", "--raster-base-w", "--raster-base-h", "--raster-k", '--fullscreen-bottom', '--document-column', '--document-scale']) {
        style.removeProperty(name);
      }
      this.documentRuntime?.setViewport?.(null);
    }

    this.rasterRect = rect;
    this.dirty = true;
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

  refreshTypography() {
    // Layout installers wrap _fit(), so this single call refreshes desktop,
    // portrait and landscape geometry without reinstalling any runtime.
    this._fit();
    this.dirty = true;
  }

  detachDocumentRuntime(runtime) {
    if (runtime && this.documentRuntime !== runtime) return;
    this.documentRuntime = null;
    this.dirty = true;
  }

  _commitNavigation(mode = "push", extraState = {}) {
    return this.navigationController.commit(mode, extraState);
  }

  _restoreNavigation() {
    return this.navigationController.restore();
  }

  go(route, { historyMode = "push" } = {}) {
    return this.navigationController.go(route, { historyMode });
  }

  scrollBy(rows) {
    return this.navigationController.scrollBy(rows);
  }

  scrollTo(rows) {
    return this.navigationController.scrollTo(rows);
  }

  move(d) {
    return this.navigationController.move(d);
  }

  enter() {
    return this.navigationController.enter();
  }

  back() {
    return this.navigationController.back();
  }

  _syncKeys() {
    return this.navigationController.syncKeys();
  }

  render(retype = false) {
    return this.renderController.render(retype);
  }

  _announce() {
    return this.renderController.announce();
  }

  boot() {
    return this.renderController.boot();
  }

  frame(ms) {
    return this.renderController.frame(ms);
  }
}

export function start() { return new App(); }
