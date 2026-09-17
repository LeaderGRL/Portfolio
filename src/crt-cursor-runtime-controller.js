import { CrtCursorController } from './crt-cursor-controller.js'
import { CRT_CURSOR_STATE } from './crt-cursor-state.js'

const PROBE_CORNERS = [
  { left: '0', top: '0' },
  { right: '0', top: '0' },
  { right: '0', bottom: '0' },
  { left: '0', bottom: '0' },
]

const CRT_BYPASS_PHOSPHOR = 0.58
const SOFTKEY_OVERLAY_PHOSPHOR = 0.72
const EDGE_OVERLAY_PHOSPHOR = 1

function pointFromProbe(probe) {
  const rect = probe?.getBoundingClientRect?.()
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null
  return { x: rect.left, y: rect.top }
}

/**
 * Chromium/WebKit do not expose GeometryUtils#getBoxQuads consistently. The
 * cursor still needs the projected tube corners because the chassis is tilted
 * in 3D. Four zero-size children inherit the exact browser transform/perspective
 * chain, so their client rect origins provide the same corner coordinates
 * without rebuilding CSS transform math in JavaScript.
 */
export function installTubeQuadFallback(tube, documentRef = globalThis.document) {
  if (!tube || typeof tube.getBoxQuads === 'function' || !documentRef?.createElement || !tube.append) {
    return () => {}
  }

  const probes = PROBE_CORNERS.map((corner, index) => {
    const probe = documentRef.createElement('i')
    probe.dataset.crtCursorQuadProbe = String(index)
    probe.setAttribute?.('aria-hidden', 'true')
    Object.assign(probe.style, {
      position: 'absolute',
      width: '0',
      height: '0',
      margin: '0',
      padding: '0',
      border: '0',
      pointerEvents: 'none',
      opacity: '0',
      ...corner,
    })
    tube.append(probe)
    return probe
  })

  const fallback = () => {
    const points = probes.map(pointFromProbe)
    if (points.some(point => !point)) return []
    return [{ p1: points[0], p2: points[1], p3: points[2], p4: points[3] }]
  }

  Object.defineProperty(tube, 'getBoxQuads', {
    configurable: true,
    value: fallback,
  })

  return () => {
    if (tube.getBoxQuads === fallback) delete tube.getBoxQuads
    for (const probe of probes) probe.remove?.()
  }
}

export class CrtCursorRuntimeController extends CrtCursorController {
  constructor(app, options = {}) {
    super(app, options)
    this.softkey = false
    this.softkeyDirty = true
    this.softkeyFullscreen = Boolean(app?.state?.fullscreen)
    this.activePhosphor = 1
    this.releasePhosphor = 1
    this.fresh = false
    this.onPointerOver = event => {
      if (event?.target?.tagName === 'IFRAME' || this.state === CRT_CURSOR_STATE.NATIVE_EXTERNAL) {
        this.handlePointerMove(event)
      }
    }
    this.removeTubeQuadFallback = installTubeQuadFallback(this.tube, this.document)
  }

  install() {
    super.install()
    if (this.installed) this.window.addEventListener('pointerover', this.onPointerOver, true)
    return this
  }

  invalidateGeometry() {
    super.invalidateGeometry()
    this.softkeyDirty = true
  }

  syncPower() {
    if (this._powered()) return
    this.fresh = true
    this._forceNative()
    this._resetReaction?.()
  }

  handlePointerMove(event) {
    const externalBefore = this.state === CRT_CURSOR_STATE.NATIVE_EXTERNAL
    const externalNow = event?.target?.tagName === 'IFRAME'
    if (externalBefore && !externalNow) this.motion.timeMs = null

    const fullscreen = Boolean(this.app?.state?.fullscreen)
    this.softkey = Boolean(fullscreen && event?.target?.closest?.('.softkeys__key'))
    this.softkeyFullscreen = fullscreen
    this.softkeyDirty = false
    if (this._powered()) this.fresh = false
    super.handlePointerMove(event)

    if (!this._powered() || !this._eligible()) return
    if (externalNow) {
      if (!externalBefore) {
        this._forceNative()
        this._resetReaction?.()
        this.state = CRT_CURSOR_STATE.NATIVE_EXTERNAL
        this._syncDomState('external')
      }
      return
    }

    if (!externalBefore || this.state !== CRT_CURSOR_STATE.NATIVE_EXTERNAL) return
    if (this.edge?.inside) {
      this.state = CRT_CURSOR_STATE.CRT_ACTIVE
      this.zoneLatched = true
      this._setOwnership(true)
      this._renderActiveRepresentation(0, 0)
    } else {
      this.state = CRT_CURSOR_STATE.NATIVE_OUTSIDE
      this._syncDomState('native')
    }
  }

  frame(ms) {
    if (!this._powered()) {
      this.syncPower()
      this.lastFrameMs = ms
      return
    }
    if (this.fresh) {
      this.lastFrameMs = ms
      return
    }

    const fullscreen = Boolean(this.app?.state?.fullscreen)
    if (fullscreen !== this.softkeyFullscreen) {
      this.softkeyFullscreen = fullscreen
      this.softkeyDirty = true
    }

    if (!fullscreen) {
      this.softkey = false
      this.softkeyDirty = false
    } else if (this.motion.timeMs != null && this.softkeyDirty) {
      this.softkey = Boolean(this.document?.elementFromPoint?.(this.motion.x, this.motion.y)?.closest?.('.softkeys__key'))
      this.softkeyDirty = false
    }

    super.frame(ms)
  }

  _showDomActiveRepresentation(phosphor, owner) {
    this.activePhosphor = phosphor
    this.app.crt.setCursorState({
      visible: false,
      compression: 0,
      recompositionStrength: 0,
    })
    this.view.show?.()
    this._updateDomCursor(phosphor, 'bypass')
    this._syncDomState(owner)
  }

  _renderActiveRepresentation(compression, recompositionStrength) {
    if (this.softkey && this.state === CRT_CURSOR_STATE.CRT_ACTIVE) {
      this._showDomActiveRepresentation(SOFTKEY_OVERLAY_PHOSPHOR, 'svg-overlay')
      return
    }

    if (this.state === CRT_CURSOR_STATE.CRT_ACTIVE && this.edge?.signedDistancePx > 0) {
      const phosphor = this._crtOpticsEnabled()
        ? EDGE_OVERLAY_PHOSPHOR
        : CRT_BYPASS_PHOSPHOR
      this._showDomActiveRepresentation(phosphor, 'svg-edge')
      return
    }

    this.activePhosphor = this._crtOpticsEnabled() ? 1 : CRT_BYPASS_PHOSPHOR
    super._renderActiveRepresentation(compression, recompositionStrength)
  }

  _startRelease(ms) {
    // Preserve the treatment actually visible before runtime flags change.
    this.releasePhosphor = this.activePhosphor
    super._startRelease(ms)
  }

  _updateDomCursor(progress, phase) {
    super._updateDomCursor(
      phase === 'release' ? progress * this.releasePhosphor : progress,
      phase,
    )
  }

  destroy() {
    this.window?.removeEventListener('pointerover', this.onPointerOver, true)
    super.destroy()
    this.removeTubeQuadFallback?.()
    this.removeTubeQuadFallback = null
  }
}
