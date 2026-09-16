import {
  createTubeAperture,
  evaluateTubeAperture,
  magneticZoneProgress,
  updateMagneticZoneLatch,
} from './crt-cursor-geometry.js'
import {
  CRT_CURSOR_EVENT,
  CRT_CURSOR_STATE,
  FINE_POINTER_MEDIA_QUERY,
  createPointerMotion,
  cursorCapabilityEligible,
  pointerSpeedAt,
  transitionCursorState,
  updatePointerMotion,
} from './crt-cursor-state.js'
import { DEFAULT_CRT_CURSOR_GPU_STATE } from './crt-cursor-shape.js'
import { CrtCursorView } from './crt-cursor-view.js'

export const CRT_CURSOR_SIZE_PX = DEFAULT_CRT_CURSOR_GPU_STATE.sizePx
export const RELEASE_DURATION_MS = 120
export const RECOMPOSE_DURATION_MS = 105

const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep01 = value => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}
const normalizeAngle = value => Math.atan2(Math.sin(value), Math.cos(value))

export function easeMagneticProgress(value) {
  const t = clamp01(value)
  return t * t
}

export function absorptionDurationMs(speedPxPerMs) {
  const speed = clamp01((Number.isFinite(speedPxPerMs) ? speedPxPerMs : 0) / 1.6)
  return 240 - smoothstep01(speed) * 60
}

export function outputUvFromClient(rect, x, y) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 }
  return {
    x: (x - rect.left) / rect.width,
    y: 1 - (y - rect.top) / rect.height,
  }
}

export function inwardBendDegrees(angle, inwardNormal, strength) {
  if (!inwardNormal) return 0
  const normalAngle = Math.atan2(inwardNormal.y, inwardNormal.x)
  const relative = normalizeAngle(normalAngle - angle)
  return Math.sin(relative) * 7 * clamp01(strength)
}

function numericCssPx(style, name, fallback) {
  const value = Number.parseFloat(style?.getPropertyValue?.(name))
  return Number.isFinite(value) ? value : fallback
}

export class CrtCursorController {
  constructor(app, {
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    view = null,
    finePointerQuery = null,
    reducedMotionQuery = null,
    now = () => globalThis.performance?.now?.() ?? Date.now(),
  } = {}) {
    this.app = app
    this.document = documentRef
    this.window = windowRef
    this.now = now
    this.tube = this.document?.getElementById?.('tube') || null
    this.view = view || new CrtCursorView(this.document)
    this.finePointerQuery = finePointerQuery || this.window?.matchMedia?.(FINE_POINTER_MEDIA_QUERY) || { matches: false }
    this.reducedMotionQuery = reducedMotionQuery || this.window?.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false }

    this.state = CRT_CURSOR_STATE.NATIVE_OUTSIDE
    this.motion = createPointerMotion()
    this.pointerType = 'mouse'
    this.aperture = null
    this.tubeRect = null
    this.edge = null
    this.zoneLatched = false
    this.absorption = null
    this.release = null
    this.recompose = null
    this.pendingRelease = false
    this.pendingReleaseCancel = false
    this.installed = false
    this.lastFrameMs = null

    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.refreshGeometry = this.refreshGeometry.bind(this)
  }

  install() {
    if (this.installed || !this.window || !this.tube) return this
    this.installed = true
    this.view.mount?.(this.document.body)
    this.refreshGeometry()
    this.window.addEventListener('pointermove', this.handlePointerMove, { passive: true, capture: true })
    this.window.addEventListener('resize', this.refreshGeometry, { passive: true })
    this._syncDomState('native')
    return this
  }

  destroy() {
    if (!this.installed) return
    this.window.removeEventListener('pointermove', this.handlePointerMove, true)
    this.window.removeEventListener('resize', this.refreshGeometry)
    this._forceNative()
    this.view.destroy?.()
    this.installed = false
  }

  refreshGeometry() {
    if (!this.tube) return null
    const rect = this.tube.getBoundingClientRect?.()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null

    const fullscreen = Boolean(this.app?.state?.fullscreen || this.document?.body?.classList?.contains?.('is-crt-fullscreen'))
    let bleedX = 0
    let bleedY = 0
    if (!fullscreen) {
      const style = this.window?.getComputedStyle?.(this.document.documentElement)
      const scaleX = rect.width / (this.tube.offsetWidth || rect.width)
      const scaleY = rect.height / (this.tube.offsetHeight || rect.height)
      bleedX = numericCssPx(style, '--tube-bleed-x', 12) * scaleX
      bleedY = numericCssPx(style, '--tube-bleed-y', 10) * scaleY
    }

    bleedX = Math.min(Math.max(0, bleedX), rect.width * 0.2)
    bleedY = Math.min(Math.max(0, bleedY), rect.height * 0.2)
    this.tubeRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    this.aperture = createTubeAperture({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      bleedX,
      bleedY,
    })
    return this.aperture
  }

  handlePointerMove(event) {
    const timeMs = Number.isFinite(event?.timeStamp) ? event.timeStamp : this.now()
    this.pointerType = event?.pointerType || 'mouse'
    this.motion = updatePointerMotion(this.motion, {
      x: event.clientX,
      y: event.clientY,
      timeMs,
    })

    if (!this._eligible() || !this._powered()) {
      this._forceNative()
      return
    }

    this.refreshGeometry()
    if (!this.aperture) return
    this.edge = evaluateTubeAperture(this.aperture, this.motion.x, this.motion.y)

    if (this.reducedMotionQuery.matches) {
      this._handleReducedMotion()
      return
    }

    switch (this.state) {
      case CRT_CURSOR_STATE.NATIVE_OUTSIDE:
        this.zoneLatched = updateMagneticZoneLatch(this.aperture, false, this.edge.signedDistancePx)
        if (this.zoneLatched) this._startAbsorption(timeMs)
        break
      case CRT_CURSOR_STATE.ABSORBING:
        this.zoneLatched = updateMagneticZoneLatch(this.aperture, true, this.edge.signedDistancePx)
        if (!this.zoneLatched && this.absorption) this.absorption.reversing = true
        break
      case CRT_CURSOR_STATE.CRT_ACTIVE:
        this.zoneLatched = updateMagneticZoneLatch(this.aperture, true, this.edge.signedDistancePx)
        this.pendingRelease = !this.zoneLatched
        break
      case CRT_CURSOR_STATE.RELEASING:
        this.zoneLatched = updateMagneticZoneLatch(this.aperture, false, this.edge.signedDistancePx)
        this.pendingReleaseCancel = this.zoneLatched
        break
      default:
        break
    }
  }

  frame(ms) {
    if (!Number.isFinite(ms)) return
    const dtMs = this.lastFrameMs == null ? 0 : Math.max(0, Math.min(50, ms - this.lastFrameMs))
    this.lastFrameMs = ms

    if (!this._eligible() || !this._powered()) {
      this._forceNative()
      return
    }

    if (this.state !== CRT_CURSOR_STATE.NATIVE_OUTSIDE) {
      // Keep output-space anchoring aligned with the subtly tilting chassis.
      // This is a geometry read only; it never invalidates the raster source.
      this.refreshGeometry()
      if (this.aperture && this.motion.timeMs != null) {
        this.edge = evaluateTubeAperture(this.aperture, this.motion.x, this.motion.y)
        if (this.state === CRT_CURSOR_STATE.ABSORBING) {
          this.zoneLatched = updateMagneticZoneLatch(this.aperture, true, this.edge.signedDistancePx)
          if (!this.zoneLatched && this.absorption) this.absorption.reversing = true
        } else if (this.state === CRT_CURSOR_STATE.CRT_ACTIVE) {
          this.zoneLatched = updateMagneticZoneLatch(this.aperture, true, this.edge.signedDistancePx)
          this.pendingRelease = !this.zoneLatched
        } else if (this.state === CRT_CURSOR_STATE.RELEASING) {
          this.zoneLatched = updateMagneticZoneLatch(this.aperture, false, this.edge.signedDistancePx)
          this.pendingReleaseCancel = this.zoneLatched
        }
      }
    }

    if (this.reducedMotionQuery.matches) {
      this._handleReducedMotion()
      if (this.state === CRT_CURSOR_STATE.CRT_ACTIVE) this._updateGpu(0, 0)
      return
    }

    if (this.pendingRelease && this.state === CRT_CURSOR_STATE.CRT_ACTIVE) {
      this._startRelease(ms)
    }

    switch (this.state) {
      case CRT_CURSOR_STATE.ABSORBING:
        this._frameAbsorption(ms, dtMs)
        break
      case CRT_CURSOR_STATE.CRT_ACTIVE:
        this._frameActive(ms)
        break
      case CRT_CURSOR_STATE.RELEASING:
        if (this.pendingReleaseCancel || this.zoneLatched) this._cancelRelease()
        else this._frameRelease(ms)
        break
      default:
        break
    }
  }

  _eligible() {
    const fine = Boolean(this.finePointerQuery.matches)
    return cursorCapabilityEligible({ canHover: fine, finePointer: fine, pointerType: this.pointerType })
  }

  _powered() {
    return Boolean(this.app?.crt?.ok && this.app?.state?.powerTarget > 0)
  }

  _startAbsorption(timeMs) {
    this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.CAPTURE_START)
    const speed = pointerSpeedAt(this.motion, timeMs)
    this.absorption = {
      startedAtMs: timeMs,
      durationMs: absorptionDurationMs(speed),
      progress: 0,
      reversing: false,
    }
    this.pendingRelease = false
    this._setOwnership(true)
    this.view.show?.()
    this._updateDomCursor(0, 'absorb')
    this._syncDomState('svg')
  }

  _frameAbsorption(ms, dtMs) {
    if (!this.absorption || !this.edge || !this.aperture) return
    const model = this.absorption
    if (!this.zoneLatched) model.reversing = true

    if (model.reversing) {
      model.progress = Math.max(0, model.progress - (dtMs || 16.67) / 105)
    } else {
      const geometryProgress = easeMagneticProgress(magneticZoneProgress(this.aperture, this.edge.signedDistancePx))
      const timeProgress = clamp01((ms - model.startedAtMs) / model.durationMs)
      const desired = Math.min(geometryProgress, timeProgress)
      if (desired >= model.progress) model.progress = desired
      else model.progress = Math.max(desired, model.progress - (dtMs || 16.67) / 90)
    }

    this._updateDomCursor(model.progress, 'absorb')

    if (model.reversing && model.progress <= 0.001) {
      this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.CAPTURE_CANCEL)
      this.absorption = null
      this.zoneLatched = false
      this.view.hide?.()
      this._setOwnership(false)
      this._syncDomState('native')
      return
    }

    if (!model.reversing
      && model.progress >= 0.995
      && this.edge.signedDistancePx <= -this.aperture.snapDepthPx) {
      this._snap(ms)
    }
  }

  _snap(ms) {
    this._updateGpu(0.16, 1)
    this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.SNAP)
    this.absorption = null
    this.recompose = { startedAtMs: ms }
    this.view.hide?.()
    this._syncDomState('gpu')
  }

  _frameActive(ms) {
    let compression = 0
    let recompositionStrength = 0
    if (this.recompose) {
      const elapsed = Math.max(0, ms - this.recompose.startedAtMs)
      const remaining = clamp01(1 - elapsed / RECOMPOSE_DURATION_MS)
      compression = remaining * 0.16
      recompositionStrength = remaining
      if (remaining <= 0) this.recompose = null
    }
    this._updateGpu(compression, recompositionStrength)
  }

  _startRelease(ms) {
    this.pendingRelease = false
    this.pendingReleaseCancel = false
    this.zoneLatched = false
    this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.RELEASE_START)
    this.release = { startedAtMs: ms }
    this.recompose = null
    this.app.crt.setCursorState({ visible: false, compression: 0, recompositionStrength: 0 })
    this.view.show?.()
    this._updateDomCursor(1, 'release')
    this._syncDomState('svg')
  }

  _cancelRelease() {
    this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.RELEASE_CANCEL)
    this.release = null
    this.pendingRelease = false
    this.pendingReleaseCancel = false
    this.view.hide?.()
    this._updateGpu(0, 0)
    this._syncDomState('gpu')
  }

  _frameRelease(ms) {
    if (!this.release) return
    const elapsed = Math.max(0, ms - this.release.startedAtMs)
    const t = clamp01(elapsed / RELEASE_DURATION_MS)
    const phosphor = 1 - smoothstep01(t)
    this._updateDomCursor(phosphor, 'release')

    if (t >= 1) {
      this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.RELEASE_COMPLETE)
      this.release = null
      this.zoneLatched = false
      this.view.hide?.()
      this._setOwnership(false)
      this.app.crt.setCursorState({ visible: false, compression: 0, recompositionStrength: 0 })
      this._syncDomState('native')
    }
  }

  _updateDomCursor(progress, phase) {
    if (!this.edge) return
    const speed = pointerSpeedAt(this.motion, this.lastFrameMs ?? this.motion.timeMs ?? 0)
    const speedStrength = clamp01(speed / 1.8)
    const crossing = phase === 'absorb'
      ? smoothstep01((progress - 0.82) / 0.18)
      : smoothstep01(progress) * 0.32
    const stretch = phase === 'absorb'
      ? 1 + progress * (0.21 + speedStrength * 0.08) * (1 - crossing * 0.48)
      : 1 + progress * 0.055
    const compression = phase === 'absorb' ? crossing * 0.20 : (1 - progress) * 0.05
    const bendDeg = inwardBendDegrees(this.motion.angle, this.edge.inwardNormal, phase === 'absorb' ? progress : progress * 0.35)

    this.view.update?.({
      x: this.motion.x,
      y: this.motion.y,
      angle: this.motion.angle,
      sizePx: CRT_CURSOR_SIZE_PX,
      phosphor: progress,
      stretch,
      compression,
      bendDeg,
      crossing,
    })
  }

  _updateGpu(compression, recompositionStrength) {
    if (!this.tubeRect) this.refreshGeometry()
    if (!this.tubeRect) return
    this.app.crt.setCursorState({
      visible: true,
      hotspotUv: outputUvFromClient(this.tubeRect, this.motion.x, this.motion.y),
      angle: -this.motion.angle,
      sizePx: CRT_CURSOR_SIZE_PX,
      compression,
      hoverIntensity: 0,
      clickImpulse: 0,
      recompositionStrength,
    })
  }

  _handleReducedMotion() {
    if (!this.edge) return
    if (this.edge.inside && this.state === CRT_CURSOR_STATE.NATIVE_OUTSIDE) {
      this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.DIRECT_ENTER)
      this.zoneLatched = true
      this._setOwnership(true)
      this.view.hide?.()
      this._updateGpu(0, 0)
      this._syncDomState('gpu')
    } else if (!this.edge.inside && this.state === CRT_CURSOR_STATE.CRT_ACTIVE) {
      this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.DIRECT_EXIT)
      this.zoneLatched = false
      this.app.crt.setCursorState({ visible: false })
      this._setOwnership(false)
      this._syncDomState('native')
    }
  }

  _setOwnership(owned) {
    this.document?.documentElement?.classList?.toggle?.('crt-cursor-owned', Boolean(owned))
  }

  _syncDomState(owner) {
    if (!this.tube?.dataset) return
    this.tube.dataset.crtCursorState = this.state
    this.tube.dataset.crtCursorOwner = owner
  }

  _forceNative() {
    if (this.state !== CRT_CURSOR_STATE.NATIVE_OUTSIDE) {
      this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.POWER_OFF)
    }
    this.zoneLatched = false
    this.absorption = null
    this.release = null
    this.recompose = null
    this.pendingRelease = false
    this.pendingReleaseCancel = false
    this.view.hide?.()
    this.app?.crt?.setCursorState?.({ visible: false, compression: 0, recompositionStrength: 0 })
    this._setOwnership(false)
    this._syncDomState('native')
  }
}
