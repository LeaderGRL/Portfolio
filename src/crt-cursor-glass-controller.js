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
const lerp = (from, to, t) => from + (to - from) * t

function blendReactionPlacement(from, to, progress) {
  if (!from) return to
  if (!to) return from

  const t = clamp01(progress)
  const directionX = lerp(from.direction.x, to.direction.x, t)
  const directionY = lerp(from.direction.y, to.direction.y, t)
  const directionLength = Math.hypot(directionX, directionY)

  return {
    hotspotUv: {
      x: lerp(from.hotspotUv.x, to.hotspotUv.x, t),
      y: lerp(from.hotspotUv.y, to.hotspotUv.y, t),
    },
    direction: directionLength > 1e-6
      ? { x: directionX / directionLength, y: directionY / directionLength }
      : from.direction,
    radiusPx: lerp(from.radiusPx, to.radiusPx, t),
  }
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
    this.recoil = null
    this.seed = null
    this.lastReactionPhase = 'idle'
  }

  frame(ms) {
    const previousState = this.state
    const renderedReaction = this.app?.crt?.reactionState
    super.frame(ms)

    if (!this.app?.crt?.setReactionState) return

    const snapped = previousState === CRT_CURSOR_STATE.ABSORBING
      && this.state === CRT_CURSOR_STATE.CRT_ACTIVE
      && !this.reducedMotionQuery.matches

    if (snapped) this._startRecoil(ms)
    if (previousState === CRT_CURSOR_STATE.CRT_ACTIVE && this.state === CRT_CURSOR_STATE.RELEASING) {
      this.seed = renderedReaction?.active ? renderedReaction : null
    }

    switch (this.state) {
      case CRT_CURSOR_STATE.ABSORBING:
        this.recoil = null
        this.seed = null
        this._absorb()
        break
      case CRT_CURSOR_STATE.CRT_ACTIVE:
        this.seed = null
        this._recoil(ms)
        break
      case CRT_CURSOR_STATE.RELEASING:
        this.recoil = null
        this._release(ms)
        break
      default:
        this.recoil = null
        this.seed = null
        this._resetReaction()
        break
    }
  }

  _placement() {
    if (!this.tubeProjection || !this.edge) return null
    return gpuReactionPlacementFromClient(
      this.tubeProjection,
      this.motion.x,
      this.motion.y,
      this.edge.inwardNormal,
      GLASS_REACTION_RADIUS_PX,
    )
  }

  _applyReaction(placement, sample, phase) {
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

  _absorb() {
    const progress = clamp01(this.absorption?.progress ?? 0)
    const crossing = smoothstep01((progress - 0.80) / 0.20)
    this._applyReaction(this._placement(), {
      strength: smoothstep01(progress),
      submergedStrength: crossing * 0.72,
      recoilStrength: 0,
    }, crossing > 0.02 ? 'pre-snap' : 'absorb')
  }

  _startRecoil(ms) {
    const placement = this._placement()
    if (!placement) {
      this.recoil = null
      return
    }
    this.recoil = { startedAtMs: ms, placement }
  }

  _recoil(ms) {
    if (!this.recoil) {
      this._resetReaction()
      return
    }

    const elapsed = Math.max(0, ms - this.recoil.startedAtMs)
    const sample = glassRecoilSample(elapsed)
    this._applyReaction(this.recoil.placement, sample, 'recoil')
    if (elapsed >= GLASS_RECOIL_DURATION_MS) {
      this.recoil = null
      this._resetReaction()
    }
  }

  _release(ms) {
    if (!this.release) {
      this._resetReaction()
      return
    }
    const elapsed = Math.max(0, ms - this.release.startedAtMs)
    const quiet = releaseReactionSample(clamp01(elapsed / 120))
    const blend = this.seed ? smoothstep01(elapsed / 36) : 1
    const sample = this.seed ? {
      strength: this.seed.strength + (quiet.strength - this.seed.strength) * blend,
      submergedStrength: this.seed.submergedStrength + (quiet.submergedStrength - this.seed.submergedStrength) * blend,
      recoilStrength: this.seed.recoilStrength * (1 - blend),
    } : quiet
    const currentPlacement = this._placement()
    const placement = this.seed
      ? blendReactionPlacement(this.seed, currentPlacement, blend)
      : currentPlacement
    this._applyReaction(placement, sample, 'release')
  }

  _resetReaction() {
    this._applyReaction(null, {
      strength: 0,
      submergedStrength: 0,
      recoilStrength: 0,
    }, 'idle')
  }

  destroy() {
    this.recoil = null
    this.seed = null
    this._resetReaction()
    super.destroy()
  }
}
