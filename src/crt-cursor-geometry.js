const HALF_PI = Math.PI * 0.5
const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) * 0.5

export const DEFAULT_TUBE_EXPONENT = 3.1
export const DEFAULT_MAGNETIC_ZONE_PX = 16
export const DEFAULT_HYSTERESIS_PX = 4
export const DEFAULT_SNAP_DEPTH_PX = 2

const clamp = (value, min, max) => value < min ? min : value > max ? max : value
const signOrOne = value => value < 0 ? -1 : 1

function pointOnSuperellipse(theta, halfWidth, halfHeight, exponent) {
  const power = 2 / exponent
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return {
    x: halfWidth * Math.pow(Math.max(0, cos), power),
    y: halfHeight * Math.pow(Math.max(0, sin), power),
  }
}

function squaredDistanceToPoint(theta, point, halfWidth, halfHeight, exponent) {
  const edge = pointOnSuperellipse(theta, halfWidth, halfHeight, exponent)
  const dx = edge.x - point.x
  const dy = edge.y - point.y
  return dx * dx + dy * dy
}

function closestPointInQuadrant(point, halfWidth, halfHeight, exponent) {
  if (point.x === 0 && point.y === 0) {
    return halfWidth <= halfHeight
      ? { x: halfWidth, y: 0 }
      : { x: 0, y: halfHeight }
  }

  let left = 0
  let right = HALF_PI
  let c = right - (right - left) * GOLDEN_RATIO_CONJUGATE
  let d = left + (right - left) * GOLDEN_RATIO_CONJUGATE
  let fc = squaredDistanceToPoint(c, point, halfWidth, halfHeight, exponent)
  let fd = squaredDistanceToPoint(d, point, halfWidth, halfHeight, exponent)

  // Fixed iterations keep runtime cost deterministic while converging well below
  // a sub-pixel error for the tube sizes used by the portfolio.
  for (let index = 0; index < 22; index += 1) {
    if (fc <= fd) {
      right = d
      d = c
      fd = fc
      c = right - (right - left) * GOLDEN_RATIO_CONJUGATE
      fc = squaredDistanceToPoint(c, point, halfWidth, halfHeight, exponent)
    } else {
      left = c
      c = d
      fc = fd
      d = left + (right - left) * GOLDEN_RATIO_CONJUGATE
      fd = squaredDistanceToPoint(d, point, halfWidth, halfHeight, exponent)
    }
  }

  const theta = (left + right) * 0.5
  const candidate = pointOnSuperellipse(theta, halfWidth, halfHeight, exponent)
  const xAxis = { x: halfWidth, y: 0 }
  const yAxis = { x: 0, y: halfHeight }
  const candidates = [candidate, xAxis, yAxis]
  let closest = candidates[0]
  let closestDistance = (closest.x - point.x) ** 2 + (closest.y - point.y) ** 2
  for (let index = 1; index < candidates.length; index += 1) {
    const next = candidates[index]
    const nextDistance = (next.x - point.x) ** 2 + (next.y - point.y) ** 2
    if (nextDistance < closestDistance) {
      closest = next
      closestDistance = nextDistance
    }
  }
  return closest
}

function inwardNormalAt(edgeX, edgeY, halfWidth, halfHeight, exponent) {
  const sx = signOrOne(edgeX)
  const sy = signOrOne(edgeY)
  const nx = exponent * sx * Math.pow(Math.abs(edgeX) / halfWidth, exponent - 1) / halfWidth
  const ny = exponent * sy * Math.pow(Math.abs(edgeY) / halfHeight, exponent - 1) / halfHeight
  const length = Math.hypot(nx, ny) || 1
  return { x: -nx / length, y: -ny / length }
}

/**
 * Build the non-visual hit geometry for the photographed CRT aperture.
 *
 * `bounds` is the rendered tube rectangle in client pixels. `bleedX/Y` removes
 * the intentional live-picture overscan that sits behind the photographic
 * moulding. This geometry is only for interaction; it does not create a second
 * visual mask or alter the authored chassis alpha.
 */
export function createTubeAperture({
  left,
  top,
  width,
  height,
  bleedX = 0,
  bleedY = 0,
  exponent = DEFAULT_TUBE_EXPONENT,
  magneticZonePx = DEFAULT_MAGNETIC_ZONE_PX,
  hysteresisPx = DEFAULT_HYSTERESIS_PX,
  snapDepthPx = DEFAULT_SNAP_DEPTH_PX,
}) {
  if (![left, top, width, height, bleedX, bleedY, exponent, magneticZonePx, hysteresisPx, snapDepthPx]
    .every(Number.isFinite)) throw new TypeError('Tube aperture geometry requires finite numeric inputs')
  if (width <= 0 || height <= 0) throw new RangeError('Tube aperture bounds must be positive')
  if (bleedX < 0 || bleedY < 0 || bleedX * 2 >= width || bleedY * 2 >= height) {
    throw new RangeError('Tube aperture bleed must leave a positive visible aperture')
  }
  if (exponent <= 1) throw new RangeError('Tube aperture exponent must be greater than 1')
  if (magneticZonePx <= 0 || hysteresisPx < 0 || snapDepthPx < 0) {
    throw new RangeError('Magnetic-zone values must be non-negative and zone width must be positive')
  }

  const visible = {
    left: left + bleedX,
    top: top + bleedY,
    width: width - bleedX * 2,
    height: height - bleedY * 2,
  }
  const centerX = visible.left + visible.width * 0.5
  const centerY = visible.top + visible.height * 0.5
  const halfWidth = visible.width * 0.5
  const halfHeight = visible.height * 0.5

  return Object.freeze({
    bounds: Object.freeze({ left, top, width, height }),
    visible: Object.freeze(visible),
    centerX,
    centerY,
    halfWidth,
    halfHeight,
    exponent,
    magneticZonePx,
    hysteresisPx,
    snapDepthPx,
  })
}

/** Return exact-enough Euclidean edge data for pointer hit testing. */
export function evaluateTubeAperture(aperture, clientX, clientY) {
  if (!aperture || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    throw new TypeError('Tube aperture evaluation requires an aperture and finite point')
  }

  const localX = clientX - aperture.centerX
  const localY = clientY - aperture.centerY
  const quadrantPoint = { x: Math.abs(localX), y: Math.abs(localY) }
  const closest = closestPointInQuadrant(
    quadrantPoint,
    aperture.halfWidth,
    aperture.halfHeight,
    aperture.exponent,
  )
  const edgeX = closest.x * signOrOne(localX)
  const edgeY = closest.y * signOrOne(localY)
  const nearestBoundaryPoint = {
    x: aperture.centerX + edgeX,
    y: aperture.centerY + edgeY,
  }
  const distance = Math.hypot(clientX - nearestBoundaryPoint.x, clientY - nearestBoundaryPoint.y)
  const normalizedX = Math.abs(localX) / aperture.halfWidth
  const normalizedY = Math.abs(localY) / aperture.halfHeight
  const implicit = Math.pow(normalizedX, aperture.exponent) + Math.pow(normalizedY, aperture.exponent)
  const inside = implicit <= 1

  return {
    signedDistancePx: inside ? -distance : distance,
    inside,
    nearestBoundaryPoint,
    inwardNormal: inwardNormalAt(edgeX, edgeY, aperture.halfWidth, aperture.halfHeight, aperture.exponent),
    normalizedTubeUv: {
      x: (clientX - aperture.visible.left) / aperture.visible.width,
      y: (clientY - aperture.visible.top) / aperture.visible.height,
    },
  }
}

/**
 * Convert signed distance into the accepted progressive capture amount.
 * Positive distances are outside the aperture; negative values are inside.
 */
export function magneticZoneProgress(aperture, signedDistancePx) {
  const zoneStart = aperture.magneticZonePx
  const snapDistance = -aperture.snapDepthPx
  const raw = (zoneStart - signedDistancePx) / (zoneStart - snapDistance)
  return clamp(raw, 0, 1)
}

/**
 * Stable latch for entering/leaving the Magnetic Zone.
 * Once captured, the pointer must retreat `hysteresisPx` farther than the
 * initial zone boundary before capture eligibility drops again.
 */
export function updateMagneticZoneLatch(aperture, wasCaptured, signedDistancePx) {
  const threshold = wasCaptured
    ? aperture.magneticZonePx + aperture.hysteresisPx
    : aperture.magneticZonePx
  return signedDistancePx <= threshold
}
