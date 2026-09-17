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
    this.removeTubeQuadFallback = installTubeQuadFallback(this.tube, this.document)
  }

  install() {
    super.install()
    if (this.installed) this.window.addEventListener('pointerover', this.handlePointerMove, true)
    return this
  }

  syncPower() {
    this.motion.timeMs = null
    this.edge = null
    this._forceNative()
    this._resetReaction?.()
  }

  handlePointerMove(event) {
    const wasExternal = this.state === CRT_CURSOR_STATE.NATIVE_EXTERNAL
    const isExternal = event?.target?.tagName === 'IFRAME'
    if (wasExternal && !isExternal) this.motion.timeMs = null

    const fullscreen = !!this.app?.state?.fullscreen
    this.softkey = !!(fullscreen && event?.target?.closest?.('.softkeys__key'))
    super.handlePointerMove(event)

    if (!(this._powered() && this._eligible())) return
    if (isExternal) {
      if (!wasExternal) {
        this._forceNative()
        this._resetReaction?.()
        this.state = CRT_CURSOR_STATE.NATIVE_EXTERNAL
        this._syncDomState('external')
      }
      return
    }

    if (!wasExternal || this.state !== CRT_CURSOR_STATE.NATIVE_EXTERNAL) return
    if (this.edge?.inside) {
      this.state = CRT_CURSOR_STATE.CRT_ACTIVE
      this._setOwnership(true)
      this._renderActiveRepresentation(0, 0)
    } else {
      this.state = CRT_CURSOR_STATE.NATIVE_OUTSIDE
      this._syncDomState('native')
    }
  }

  frame(ms) {
    if (!(this._powered() && this._eligible())) {
      this.syncPower()
      return
    }

    const fullscreen = !!this.app?.state?.fullscreen
    if (!fullscreen) {
      this.softkey = false
    } else if (
      this.motion.timeMs != null
      && (fullscreen !== this.lastFullscreen || this.geometryStyleDirty)
    ) {
      this.softkey = !!this.document
        ?.elementFromPoint?.(this.motion.x, this.motion.y)
        ?.closest?.('.softkeys__key')
    }

    super.frame(ms)
  }

  _showDomActiveRepresentation(phosphor, owner) {
    this.phosphor = phosphor
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
      this._showDomActiveRepresentation(
        this._crtOpticsEnabled() ? 1 : CRT_BYPASS_PHOSPHOR,
        'svg-edge',
      )
      return
    }

    this.phosphor = this._crtOpticsEnabled() ? 1 : CRT_BYPASS_PHOSPHOR
    super._renderActiveRepresentation(compression, recompositionStrength)
  }

  _updateDomCursor(progress, phase) {
    super._updateDomCursor(
      phase === 'release' ? progress * this.phosphor : progress,
      phase,
    )
  }

  destroy() {
    this.window?.removeEventListener('pointerover', this.handlePointerMove, true)
    super.destroy()
    this.removeTubeQuadFallback?.()
    this.removeTubeQuadFallback = null
  }
}
