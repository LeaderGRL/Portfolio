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

function invert3x3(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix
  const A = e * i - f * h
  const B = f * g - d * i
  const C = d * h - e * g
  const determinant = a * A + b * B + c * C
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return null
  const inv = 1 / determinant
  return [
    A * inv,
    (c * h - b * i) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    C * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv,
  ]
}

function homographyForQuad(points) {
  if (!Array.isArray(points) || points.length !== 4) return null
  const [p0, p1, p2, p3] = points
  if (![p0, p1, p2, p3].every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))) return null

  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  let g = 0
  let h = 0

  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const denominator = dx1 * dy2 - dx2 * dy1
    if (Math.abs(denominator) < 1e-9) return null
    g = (dx3 * dy2 - dx2 * dy3) / denominator
    h = (dx1 * dy3 - dx3 * dy1) / denominator
  }

  const forward = [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ]
  const inverse = invert3x3(forward)
  return inverse ? { forward, inverse } : null
}

export function createTubeProjection({ rect, quad = null, localWidth = null, localHeight = null }) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  const width = Number.isFinite(localWidth) && localWidth > 0 ? localWidth : rect.width
  const height = Number.isFinite(localHeight) && localHeight > 0 ? localHeight : rect.height
  const homography = homographyForQuad(quad)
  return {
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    localWidth: width,
    localHeight: height,
    forwardHomography: homography?.forward || null,
    inverseHomography: homography?.inverse || null,
  }
}

export function localTubeUvFromClient(projection, x, y) {
  if (!projection) return { x: 0.5, y: 0.5 }
  const matrix = projection.inverseHomography
  if (!matrix) {
    return {
      x: (x - projection.rect.left) / projection.rect.width,
      y: (y - projection.rect.top) / projection.rect.height,
    }
  }

  const denominator = matrix[6] * x + matrix[7] * y + matrix[8]
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) {
    return {
      x: (x - projection.rect.left) / projection.rect.width,
      y: (y - projection.rect.top) / projection.rect.height,
    }
  }
  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator,
  }
}

export function clientPointFromLocalTubeUv(projection, x, y) {
  if (!projection) throw new TypeError('Tube projection is required')
  const matrix = projection.forwardHomography
  if (!matrix) {
    return {
      x: projection.rect.left + x * projection.rect.width,
      y: projection.rect.top + y * projection.rect.height,
    }
  }

  const denominator = matrix[6] * x + matrix[7] * y + matrix[8]
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) {
    return {
      x: projection.rect.left + x * projection.rect.width,
      y: projection.rect.top + y * projection.rect.height,
    }
  }
  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator,
  }
}

export function evaluateProjectedTubeAperture(projection, aperture, clientX, clientY) {
  if (!projection || !aperture || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    throw new TypeError('Projected tube aperture evaluation requires projection, aperture and finite point')
  }

  const localUv = localTubeUvFromClient(projection, clientX, clientY)
  const localX = localUv.x * projection.localWidth
  const localY = localUv.y * projection.localHeight
  const localEdge = evaluateTubeAperture(aperture, localX, localY)

  const boundaryUv = {
    x: localEdge.nearestBoundaryPoint.x / projection.localWidth,
    y: localEdge.nearestBoundaryPoint.y / projection.localHeight,
  }
  const nearestBoundaryPoint = clientPointFromLocalTubeUv(
    projection,
    boundaryUv.x,
    boundaryUv.y,
  )
  const inwardSample = clientPointFromLocalTubeUv(
    projection,
    (localEdge.nearestBoundaryPoint.x + localEdge.inwardNormal.x) / projection.localWidth,
    (localEdge.nearestBoundaryPoint.y + localEdge.inwardNormal.y) / projection.localHeight,
  )
  const normalX = inwardSample.x - nearestBoundaryPoint.x
  const normalY = inwardSample.y - nearestBoundaryPoint.y
  const normalLength = Math.hypot(normalX, normalY)
  const distancePx = Math.hypot(
    clientX - nearestBoundaryPoint.x,
    clientY - nearestBoundaryPoint.y,
  )

  return {
    ...localEdge,
    signedDistancePx: localEdge.inside ? -distancePx : distancePx,
    nearestBoundaryPoint,
    inwardNormal: normalLength > 1e-6
      ? { x: normalX / normalLength, y: normalY / normalLength }
      : localEdge.inwardNormal,
  }
}

export function gpuCursorPlacementFromClient(projection, x, y, screenAngle, screenSizePx) {
  if (!projection) {
    return {
      hotspotUv: { x: 0.5, y: 0.5 },
      angle: -screenAngle,
      sizePx: screenSizePx,
    }
  }

  const local = localTubeUvFromClient(projection, x, y)
  const sample = localTubeUvFromClient(
    projection,
    x + Math.cos(screenAngle),
    y + Math.sin(screenAngle),
  )
  const dx = (sample.x - local.x) * projection.localWidth
  const dy = (sample.y - local.y) * projection.localHeight
  const localPerScreenPx = Math.hypot(dx, dy)

  return {
    hotspotUv: { x: local.x, y: 1 - local.y },
    angle: localPerScreenPx > 1e-6 ? Math.atan2(-dy, dx) : -screenAngle,
    sizePx: screenSizePx * (localPerScreenPx > 1e-6 ? localPerScreenPx : 1),
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

function quadPointsFor(element) {
  const quads = element?.getBoxQuads?.({ box: 'border' })
  const quad = quads?.[0]
  if (!quad) return null
  return [quad.p1, quad.p2, quad.p3, quad.p4].map(point => ({ x: point.x, y: point.y }))
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
    this.tubeProjection = null
    this.edge = null
    this.zoneLatched = false
    this.absorption = null
    this.release = null
    this.recompose = null
    this.pendingRelease = false
    this.pendingReleaseCancel = false
    this.installed = false
    this.lastFrameMs = null
    this.geometryStyleDirty = true
    this.bleedCssX = 12
    this.bleedCssY = 10
    this.lastFullscreen = null

    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.invalidateGeometry = this.invalidateGeometry.bind(this)
  }

  install() {
    if (this.installed || !this.window || !this.tube) return this
    this.installed = true
    this.view.mount?.(this.document.body)
    this.refreshGeometry(true)
    this.window.addEventListener('pointermove', this.handlePointerMove, { passive: true, capture: true })
    this.window.addEventListener('resize', this.invalidateGeometry, { passive: true })
    this._syncDomState('native')
    return this
  }

  destroy() {
    if (!this.installed) return
    this.window.removeEventListener('pointermove', this.handlePointerMove, true)
    this.window.removeEventListener('resize', this.invalidateGeometry)
    this._forceNative()
    this.view.destroy?.()
    this.installed = false
  }

  invalidateGeometry() {
    this.geometryStyleDirty = true
  }

  refreshGeometry(forceStyle = false) {
    if (!this.tube) return null
    const rect = this.tube.getBoundingClientRect?.()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null

    const fullscreen = Boolean(this.app?.state?.fullscreen || this.document?.body?.classList?.contains?.('is-crt-fullscreen'))
    if (forceStyle || this.geometryStyleDirty || fullscreen !== this.lastFullscreen) {
      const style = this.window?.getComputedStyle?.(this.document.documentElement)
      this.bleedCssX = numericCssPx(style, '--tube-bleed-x', 12)
      this.bleedCssY = numericCssPx(style, '--tube-bleed-y', 10)
      this.geometryStyleDirty = false
      this.lastFullscreen = fullscreen
    }

    const localWidth = this.tube.offsetWidth || rect.width
    const localHeight = this.tube.offsetHeight || rect.height
    let bleedX = fullscreen ? 0 : this.bleedCssX
    let bleedY = fullscreen ? 0 : this.bleedCssY
    bleedX = Math.min(Math.max(0, bleedX), localWidth * 0.2)
    bleedY = Math.min(Math.max(0, bleedY), localHeight * 0.2)

    this.tubeRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    this.tubeProjection = createTubeProjection({
      rect: this.tubeRect,
      quad: quadPointsFor(this.tube),
      localWidth,
      localHeight,
    })
    this.aperture = createTubeAperture({
      left: 0,
      top: 0,
      width: localWidth,
      height: localHeight,
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

    if (!this.aperture || !this.tubeProjection) this.refreshGeometry()
    if (!this.aperture || !this.tubeProjection) return
    this.edge = evaluateProjectedTubeAperture(
      this.tubeProjection,
      this.aperture,
      this.motion.x,
      this.motion.y,
    )

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

    if (this.motion.timeMs != null) {
      // The chassis can tilt every application frame. Read transformed geometry
      // once here, never on the high-rate pointermove path.
      this.refreshGeometry()
      if (this.aperture && this.tubeProjection) {
        this.edge = evaluateProjectedTubeAperture(
          this.tubeProjection,
          this.aperture,
          this.motion.x,
          this.motion.y,
        )
        if (this.state === CRT_CURSOR_STATE.ABSORBING) {
          this.zoneLatched = updateMagneticZoneLatch(this.aperture, true, this.edge.signedDistancePx)
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
      if (this.state === CRT_CURSOR_STATE.CRT_ACTIVE) this._renderActiveRepresentation(0, 0)
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

  _crtOpticsEnabled() {
    return Boolean(this.app?.state?.crtTarget > 0.5 && !this.tube?.classList?.contains?.('is-crt-off'))
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
    const nextReversing = !this.zoneLatched
    if (model.reversing && !nextReversing) {
      // Rebase the successful-entry clock to the current unwound progress.
      // Re-entering deeply must continue from the visible state rather than
      // catching up to elapsed wall time in a single frame.
      model.startedAtMs = ms - model.progress * model.durationMs
    }
    model.reversing = nextReversing

    if (model.reversing) {
      model.progress = Math.max(0, model.progress - (dtMs || 16.67) / 105)
    } else {
      const geometryProgress = easeMagneticProgress(magneticZoneProgress(this.aperture, this.edge.signedDistancePx))
      const timeProgress = clamp01((ms - model.startedAtMs) / model.durationMs)
      const desired = Math.min(geometryProgress, timeProgress)
      if (desired >= model.progress) {
        const maxForwardStep = (dtMs || 16.67) / model.durationMs
        model.progress = Math.min(desired, model.progress + maxForwardStep)
      } else {
        model.progress = Math.max(desired, model.progress - (dtMs || 16.67) / 90)
      }
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
    this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.SNAP)
    this.absorption = null
    this.recompose = { startedAtMs: ms }
    this._setOwnership(true)
    this._renderActiveRepresentation(0.16, 1)
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
    this._renderActiveRepresentation(compression, recompositionStrength)
  }

  _renderActiveRepresentation(compression, recompositionStrength) {
    if (!this._crtOpticsEnabled()) {
      this.app.crt.setCursorState({ visible: false, compression: 0, recompositionStrength: 0 })
      this.view.show?.()
      this._updateDomCursor(0.58, 'bypass')
      this._syncDomState('svg')
      return
    }

    this.view.hide?.()
    this._updateGpu(compression, recompositionStrength)
    this._syncDomState('gpu')
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
    this._renderActiveRepresentation(0, 0)
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
    const isBypass = phase === 'bypass'
    const crossing = isBypass
      ? 0
      : phase === 'absorb'
        ? smoothstep01((progress - 0.82) / 0.18)
        : smoothstep01(progress) * 0.32
    const stretch = isBypass
      ? 1
      : phase === 'absorb'
        ? 1 + progress * (0.21 + speedStrength * 0.08) * (1 - crossing * 0.48)
        : 1 + progress * 0.055
    const compression = isBypass ? 0 : phase === 'absorb' ? crossing * 0.20 : (1 - progress) * 0.05
    const bendDeg = isBypass
      ? 0
      : inwardBendDegrees(this.motion.angle, this.edge.inwardNormal, phase === 'absorb' ? progress : progress * 0.35)

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
    if (!this.tubeProjection) this.refreshGeometry()
    if (!this.tubeProjection) return
    const placement = gpuCursorPlacementFromClient(
      this.tubeProjection,
      this.motion.x,
      this.motion.y,
      this.motion.angle,
      CRT_CURSOR_SIZE_PX,
    )
    this.app.crt.setCursorState({
      visible: true,
      hotspotUv: placement.hotspotUv,
      angle: placement.angle,
      sizePx: placement.sizePx,
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
      this._renderActiveRepresentation(0, 0)
    } else if (!this.edge.inside && this.state === CRT_CURSOR_STATE.CRT_ACTIVE) {
      this.state = transitionCursorState(this.state, CRT_CURSOR_EVENT.DIRECT_EXIT)
      this.zoneLatched = false
      this.app.crt.setCursorState({ visible: false })
      this.view.hide?.()
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
