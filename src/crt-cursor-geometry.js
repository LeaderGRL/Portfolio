const HALF_PI = Math.PI * 0.5
const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) * 0.5
const DISTANCE_SCAN_SEGMENTS = 128
const DISTANCE_REFINE_ITERATIONS = 24

export const DEFAULT_TUBE_EXPONENT = 3.1
export const DEFAULT_MAGNETIC_ZONE_PX = 16
export const DEFAULT_HYSTERESIS_PX = 4
export const DEFAULT_SNAP_DEPTH_PX = 2

const clamp = (value, min, max) => value < min ? min : value > max ? max : value
const signOrOne = value => value < 0 ? -1 : 1

function pointOnSuperellipse(theta, halfWidth, halfHeight, exponent) {
  if (theta <= 0) return { x: halfWidth, y: 0 }
  if (theta >= HALF_PI) return { x: 0, y: halfHeight }

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

function refineDistanceMinimum(left, right, point, halfWidth, halfHeight, exponent) {
  let c = right - (right - left) * GOLDEN_RATIO_CONJUGATE
  let d = left + (right - left) * GOLDEN_RATIO_CONJUGATE
  let fc = squaredDistanceToPoint(c, point, halfWidth, halfHeight, exponent)
  let fd = squaredDistanceToPoint(d, point, halfWidth, halfHeight, exponent)

  for (let index = 0; index < DISTANCE_REFINE_ITERATIONS; index += 1) {
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
  return {
    theta,
    distance: squaredDistanceToPoint(theta, point, halfWidth, halfHeight, exponent),
  }
}

function closestPointInQuadrant(point, halfWidth, halfHeight, exponent) {
  if (point.x === 0 && point.y === 0) {
    return halfWidth <= halfHeight
      ? { x: halfWidth, y: 0 }
      : { x: 0, y: halfHeight }
  }

  const step = HALF_PI / DISTANCE_SCAN_SEGMENTS
  const samples = new Array(DISTANCE_SCAN_SEGMENTS + 1)
  let bestTheta = 0
  let bestDistance = Infinity

  for (let index = 0; index <= DISTANCE_SCAN_SEGMENTS; index += 1) {
    const theta = index * step
    const distance = squaredDistanceToPoint(theta, point, halfWidth, halfHeight, exponent)
    samples[index] = distance
    if (distance < bestDistance) {
      bestDistance = distance
      bestTheta = theta
    }
  }

  const considerRefinedInterval = (left, right) => {
    const candidate = refineDistanceMinimum(
      left,
      right,
      point,
      halfWidth,
      halfHeight,
      exponent,
    )
    if (candidate.distance < bestDistance) {
      bestDistance = candidate.distance
      bestTheta = candidate.theta
    }
  }

  // Distance to a superellipse is not guaranteed to be unimodal for points
  // inside the curve. Scan the full quadrant, then refine every sampled local
  // minimum instead of applying one golden-section search to the whole arc.
  // The two endpoint intervals need explicit refinement because a true minimum
  // can sit between the axis and the first/last sample without making either
  // sampled endpoint a discrete local minimum.
  considerRefinedInterval(0, step)
  considerRefinedInterval(HALF_PI - step, HALF_PI)

  for (let index = 1; index < DISTANCE_SCAN_SEGMENTS; index += 1) {
    if (samples[index] > samples[index - 1] || samples[index] > samples[index + 1]) continue
    considerRefinedInterval((index - 1) * step, (index + 1) * step)
  }

  return pointOnSuperellipse(bestTheta, halfWidth, halfHeight, exponent)
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
  // The authored CRT uses a convex squircle. Exponents below 2 describe a
  // different, diamond-like family and make the centre shortcut invalid.
  if (exponent < 2) throw new RangeError('Tube aperture exponent must be at least 2')
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

/** Return Euclidean edge data for pointer hit testing. */
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
