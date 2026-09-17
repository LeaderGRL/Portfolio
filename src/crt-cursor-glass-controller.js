import {
  localTubeUvFromClient,
} from './crt-cursor-controller.js'
import { CrtCursorRuntimeController } from './crt-cursor-runtime-controller.js'
import { CRT_CURSOR_STATE } from './crt-cursor-state.js'
import {
  GLASS_REACTION_RADIUS_PX,
  GLASS_RECOIL_DURATION_MS,
  glassRecoilSample,
  releaseReactionSample,
} from './crt-cursor-reaction.js'

const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep01 = value => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

export function gpuReactionPlacementFromClient(
  projection,
  x,
  y,
  screenDirection,
  screenRadiusPx = GLASS_REACTION_RADIUS_PX,
) {
  if (!projection) {
    return {
      hotspotUv: { x: 0.5, y: 0.5 },
      direction: { x: 0, y: 1 },
      radiusPx: screenRadiusPx,
    }
  }

  const dx = Number.isFinite(screenDirection?.x) ? screenDirection.x : 0
  const dy = Number.isFinite(screenDirection?.y) ? screenDirection.y : 1
  const screenLength = Math.hypot(dx, dy) || 1
  const nx = dx / screenLength
  const ny = dy / screenLength
  const local = localTubeUvFromClient(projection, x, y)
  const sample = localTubeUvFromClient(projection, x + nx, y + ny)
  const localDx = (sample.x - local.x) * projection.localWidth
  const localDy = (sample.y - local.y) * projection.localHeight
  const localPerScreenPx = Math.hypot(localDx, localDy)
  const scale = localPerScreenPx > 1e-6 ? localPerScreenPx : 1

  return {
    hotspotUv: { x: local.x, y: 1 - local.y },
    direction: localPerScreenPx > 1e-6
      ? { x: localDx / localPerScreenPx, y: -localDy / localPerScreenPx }
      : { x: nx, y: -ny },
    radiusPx: screenRadiusPx * scale,
  }
}

export class CrtCursorGlassController extends CrtCursorRuntimeController {
  constructor(app, options = {}) {
    super(app, options)
    this.glassRecoil = null
    this.lastReactionPhase = 'idle'
  }

  frame(ms) {
    const previousState = this.state
    super.frame(ms)

    if (!this.app?.crt?.setReactionState) return

    const snapped = previousState === CRT_CURSOR_STATE.ABSORBING
      && this.state === CRT_CURSOR_STATE.CRT_ACTIVE
      && !this.reducedMotionQuery.matches

    if (snapped) this._startGlassRecoil(ms)

    switch (this.state) {
      case CRT_CURSOR_STATE.ABSORBING:
        this.glassRecoil = null
        this._frameAbsorptionReaction()
        break
      case CRT_CURSOR_STATE.CRT_ACTIVE:
        this._frameGlassRecoil(ms)
        break
      case CRT_CURSOR_STATE.RELEASING:
        this.glassRecoil = null
        this._frameReleaseReaction(ms)
        break
      default:
        this.glassRecoil = null
        this._resetGlassReaction()
        break
    }
  }

  _currentReactionPlacement() {
    if (!this.tubeProjection || !this.edge) return null
    return gpuReactionPlacementFromClient(
      this.tubeProjection,
      this.motion.x,
      this.motion.y,
      this.edge.inwardNormal,
      GLASS_REACTION_RADIUS_PX,
    )
  }

  _applyGlassReaction(placement, sample, phase) {
    const strength = clamp01(sample?.strength ?? 0)
    const submergedStrength = clamp01(sample?.submergedStrength ?? 0)
    const recoilStrength = Math.max(-1, Math.min(1, sample?.recoilStrength ?? 0))
    const active = Boolean(
      placement
      && this._crtOpticsEnabled()
      && (strength > 0.0001 || submergedStrength > 0.0001 || Math.abs(recoilStrength) > 0.0001),
    )

    this.app.crt.setReactionState(active ? {
      active: true,
      hotspotUv: placement.hotspotUv,
      direction: placement.direction,
      radiusPx: placement.radiusPx,
      strength,
      submergedStrength,
      recoilStrength,
    } : {
      active: false,
      strength: 0,
      submergedStrength: 0,
      recoilStrength: 0,
    })

    this.lastReactionPhase = active ? phase : 'idle'
    if (this.tube?.dataset) {
      this.tube.dataset.crtCursorReaction = this.lastReactionPhase
      this.tube.dataset.crtCursorReactionStrength = active ? strength.toFixed(4) : '0.0000'
      this.tube.dataset.crtCursorReactionRecoil = active ? recoilStrength.toFixed(4) : '0.0000'
    }
  }

  _frameAbsorptionReaction() {
    const progress = clamp01(this.absorption?.progress ?? 0)
    const crossing = smoothstep01((progress - 0.80) / 0.20)
    this._applyGlassReaction(this._currentReactionPlacement(), {
      strength: smoothstep01(progress),
      submergedStrength: crossing * 0.72,
      recoilStrength: 0,
    }, crossing > 0.02 ? 'pre-snap' : 'absorb')
  }

  _startGlassRecoil(ms) {
    const placement = this._currentReactionPlacement()
    if (!placement) {
      this.glassRecoil = null
      return
    }
    this.glassRecoil = { startedAtMs: ms, placement }
  }

  _frameGlassRecoil(ms) {
    if (!this.glassRecoil) {
      this._resetGlassReaction()
      return
    }

    const elapsed = Math.max(0, ms - this.glassRecoil.startedAtMs)
    const sample = glassRecoilSample(elapsed)
    this._applyGlassReaction(this.glassRecoil.placement, sample, 'recoil')
    if (elapsed >= GLASS_RECOIL_DURATION_MS) {
      this.glassRecoil = null
      this._resetGlassReaction()
    }
  }

  _frameReleaseReaction(ms) {
    if (!this.release) {
      this._resetGlassReaction()
      return
    }
    const elapsed = Math.max(0, ms - this.release.startedAtMs)
    const t = clamp01(elapsed / 120)
    this._applyGlassReaction(
      this._currentReactionPlacement(),
      releaseReactionSample(t),
      'release',
    )
  }

  _resetGlassReaction() {
    this._applyGlassReaction(null, {
      strength: 0,
      submergedStrength: 0,
      recoilStrength: 0,
    }, 'idle')
  }

  destroy() {
    this.glassRecoil = null
    this._resetGlassReaction()
    super.destroy()
  }
}
