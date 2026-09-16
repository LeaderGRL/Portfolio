import { CrtCursorController } from './crt-cursor-controller.js'
import { CRT_CURSOR_STATE } from './crt-cursor-state.js'

const PROBE_CORNERS = [
  { left: '0', top: '0' },
  { right: '0', top: '0' },
  { right: '0', bottom: '0' },
  { left: '0', bottom: '0' },
]

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
    this.softkeyOverlayActive = false
    this.removeTubeQuadFallback = installTubeQuadFallback(this.tube, this.document)
  }

  handlePointerMove(event) {
    this.softkeyOverlayActive = Boolean(
      this.app?.state?.fullscreen
      && event?.target?.closest?.('.softkeys__key'),
    )
    super.handlePointerMove(event)
  }

  _renderActiveRepresentation(compression, recompositionStrength) {
    if (this.softkeyOverlayActive && this.state === CRT_CURSOR_STATE.CRT_ACTIVE) {
      this.app.crt.setCursorState({
        visible: false,
        compression: 0,
        recompositionStrength: 0,
      })
      this.view.show?.()
      this._updateDomCursor(0.72, 'bypass')
      this._syncDomState('svg-overlay')
      return
    }

    super._renderActiveRepresentation(compression, recompositionStrength)
  }

  destroy() {
    super.destroy()
    this.removeTubeQuadFallback?.()
    this.removeTubeQuadFallback = null
  }
}
