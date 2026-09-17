const clamp01 = value => Math.max(0, Math.min(1, value))
const clampSigned = value => Math.max(-1, Math.min(1, value))
const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback

export const GLASS_REACTION_RADIUS_PX = 56
export const GLASS_RECOIL_DURATION_MS = 240
export const RELEASE_REACTION_STRENGTH = 0.18

export const DEFAULT_CRT_GLASS_REACTION_STATE = Object.freeze({
  active: false,
  hotspotUv: Object.freeze({ x: 0.5, y: 0.5 }),
  direction: Object.freeze({ x: 0, y: 1 }),
  strength: 0,
  submergedStrength: 0,
  recoilStrength: 0,
  radiusPx: GLASS_REACTION_RADIUS_PX,
})

export function normalizeCrtGlassReactionState(
  value = {},
  fallback = DEFAULT_CRT_GLASS_REACTION_STATE,
) {
  const fallbackUv = fallback?.hotspotUv || DEFAULT_CRT_GLASS_REACTION_STATE.hotspotUv
  const fallbackDirection = fallback?.direction || DEFAULT_CRT_GLASS_REACTION_STATE.direction
  const uv = value?.hotspotUv || fallbackUv
  const direction = value?.direction || fallbackDirection
  let dx = finiteOr(direction?.x, fallbackDirection.x)
  let dy = finiteOr(direction?.y, fallbackDirection.y)
  const length = Math.hypot(dx, dy)
  if (length > 1e-6) {
    dx /= length
    dy /= length
  } else {
    dx = 0
    dy = 1
  }

  const strength = clamp01(finiteOr(value?.strength, fallback?.strength ?? 0))
  const submergedStrength = clamp01(finiteOr(
    value?.submergedStrength,
    fallback?.submergedStrength ?? 0,
  ))
  const recoilStrength = clampSigned(finiteOr(
    value?.recoilStrength,
    fallback?.recoilStrength ?? 0,
  ))
  const radiusPx = Math.max(24, Math.min(96, finiteOr(
    value?.radiusPx,
    fallback?.radiusPx ?? GLASS_REACTION_RADIUS_PX,
  )))
  const active = value?.active == null
    ? Boolean(fallback?.active)
    : Boolean(value.active)

  return Object.freeze({
    active: active && (strength > 0.0001 || submergedStrength > 0.0001 || Math.abs(recoilStrength) > 0.0001),
    hotspotUv: Object.freeze({
      x: finiteOr(uv?.x, fallbackUv.x),
      y: finiteOr(uv?.y, fallbackUv.y),
    }),
    direction: Object.freeze({ x: dx, y: dy }),
    strength,
    submergedStrength,
    recoilStrength,
    radiusPx,
  })
}

export function glassRecoilSample(elapsedMs) {
  const elapsed = Math.max(0, finiteOr(elapsedMs, 0))
  const t = clamp01(elapsed / GLASS_RECOIL_DURATION_MS)
  if (t >= 1) return Object.freeze({ strength: 0, submergedStrength: 0, recoilStrength: 0 })

  // The indentation itself settles monotonically. A much smaller signed term
  // crosses neutral about one and a half times to give the accepted glass
  // recoil without turning the whole signal into a spring.
  const settle = 1 - t * t * (3 - 2 * t)
  const oscillation = Math.exp(-4.6 * t) * Math.cos(t * Math.PI * 3.2)
  return Object.freeze({
    strength: settle,
    submergedStrength: settle * 0.42,
    recoilStrength: oscillation * 0.30,
  })
}

export function releaseReactionSample(progress) {
  const t = clamp01(progress)
  const remaining = 1 - t * t * (3 - 2 * t)
  return Object.freeze({
    strength: remaining * RELEASE_REACTION_STRENGTH,
    submergedStrength: remaining * 0.10,
    recoilStrength: 0,
  })
}
