const HALF_PI = Math.PI * 0.5
const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) * 0.5
const DISTANCE_SCAN_SEGMENTS = 128
const DISTANCE_REFINE_MAX_ITERATIONS = 64
const DISTANCE_REFINE_SPATIAL_TOLERANCE_PX = 0.001

export const DEFAULT_TUBE_EXPONENT = 3.1
export const MAX_TUBE_EXPONENT = 8
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

function superellipseX(theta, halfWidth, power) {
  if (theta <= 0) return halfWidth
  if (theta >= HALF_PI) return 0
  return halfWidth * Math.pow(Math.max(0, Math.cos(theta)), power)
}

function superellipseY(theta, halfHeight, power) {
  if (theta <= 0) return 0
  if (theta >= HALF_PI) return halfHeight
  return halfHeight * Math.pow(Math.max(0, Math.sin(theta)), power)
}

function squaredDistanceToPoint(theta, pointX, pointY, halfWidth, halfHeight, exponent) {
  const power = 2 / exponent
  const edgeX = superellipseX(theta, halfWidth, power)
  const edgeY = superellipseY(theta, halfHeight, power)
  const dx = edgeX - pointX
  const dy = edgeY - pointY
  return dx * dx + dy * dy
}

function refineDistanceMinimum(left, right, pointX, pointY, halfWidth, halfHeight, exponent) {
  const power = 2 / exponent
  const spatialToleranceSquared = DISTANCE_REFINE_SPATIAL_TOLERANCE_PX
    * DISTANCE_REFINE_SPATIAL_TOLERANCE_PX
  let c = right - (right - left) * GOLDEN_RATIO_CONJUGATE
  let d = left + (right - left) * GOLDEN_RATIO_CONJUGATE
  let fc = squaredDistanceToPoint(c, pointX, pointY, halfWidth, halfHeight, exponent)
  let fd = squaredDistanceToPoint(d, pointX, pointY, halfWidth, halfHeight, exponent)

  for (let index = 0; index < DISTANCE_REFINE_MAX_ITERATIONS; index += 1) {
    if (fc <= fd) {
      right = d
      d = c
      fd = fc
      c = right - (right - left) * GOLDEN_RATIO_CONJUGATE
      fc = squaredDistanceToPoint(c, pointX, pointY, halfWidth, halfHeight, exponent)
    } else {
      left = c
      c = d
      fc = fd
      d = left + (right - left) * GOLDEN_RATIO_CONJUGATE
      fd = squaredDistanceToPoint(d, pointX, pointY, halfWidth, halfHeight, exponent)
    }

    const leftX = superellipseX(left, halfWidth, power)
    const leftY = superellipseY(left, halfHeight, power)
    const rightX = superellipseX(right, halfWidth, power)
    const rightY = superellipseY(right, halfHeight, power)
    const spanX = rightX - leftX
    const spanY = rightY - leftY
    if (spanX * spanX + spanY * spanY <= spatialToleranceSquared) break
  }

  return (left + right) * 0.5
}

function closestPointInQuadrant(pointX, pointY, halfWidth, halfHeight, exponent) {
  if (pointX === 0 && pointY === 0) {
    return halfWidth <= halfHeight
      ? { x: halfWidth, y: 0 }
      : { x: 0, y: halfHeight }
  }

  const step = HALF_PI / DISTANCE_SCAN_SEGMENTS
  let bestTheta = 0
  let bestDistance = squaredDistanceToPoint(0, pointX, pointY, halfWidth, halfHeight, exponent)

  // Stream the scan instead of allocating sample storage in the pointer hot
  // path. Keeping the previous two scalar distances is enough to identify each
  // sampled local minimum while still considering the full quadrant.
  let previousPreviousDistance = bestDistance
  let previousDistance = squaredDistanceToPoint(step, pointX, pointY, halfWidth, halfHeight, exponent)
  if (previousDistance < bestDistance) {
    bestDistance = previousDistance
    bestTheta = step
  }

  for (let index = 2; index <= DISTANCE_SCAN_SEGMENTS; index += 1) {
    const theta = index * step
    const distance = squaredDistanceToPoint(theta, pointX, pointY, halfWidth, halfHeight, exponent)
    if (distance < bestDistance) {
      bestDistance = distance
      bestTheta = theta
    }

    const previousIndex = index - 1
    if (previousDistance <= previousPreviousDistance && previousDistance <= distance) {
      const candidateTheta = refineDistanceMinimum(
        (previousIndex - 1) * step,
        (previousIndex + 1) * step,
        pointX,
        pointY,
        halfWidth,
        halfHeight,
        exponent,
      )
      const candidateDistance = squaredDistanceToPoint(
        candidateTheta,
        pointX,
        pointY,
        halfWidth,
        halfHeight,
        exponent,
      )
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance
        bestTheta = candidateTheta
      }
    }

    previousPreviousDistance = previousDistance
    previousDistance = distance
  }

  // A true minimum can sit between an axis and the first/last scan sample
  // without either sampled endpoint looking like a local minimum. Refine those
  // intervals to a spatial tolerance rather than a fixed angular iteration
  // count so sharp but supported squircles retain sub-pixel edge accuracy.
  let candidateTheta = refineDistanceMinimum(0, step, pointX, pointY, halfWidth, halfHeight, exponent)
  let candidateDistance = squaredDistanceToPoint(
    candidateTheta,
    pointX,
    pointY,
    halfWidth,
    halfHeight,
    exponent,
  )
  if (candidateDistance < bestDistance) {
    bestDistance = candidateDistance
    bestTheta = candidateTheta
  }

  candidateTheta = refineDistanceMinimum(
    HALF_PI - step,
    HALF_PI,
    pointX,
    pointY,
    halfWidth,
    halfHeight,
    exponent,
  )
  candidateDistance = squaredDistanceToPoint(
    candidateTheta,
    pointX,
    pointY,
    halfWidth,
    halfHeight,
    exponent,
  )
  if (candidateDistance < bestDistance) {
    bestTheta = candidateTheta
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
  // The authored CRT uses a convex squircle (3.1 today), not an arbitrary
  // superellipse library. Values above 8 are effectively near-rectangular for
  // this interaction and exceed the stable/tunable domain needed by the asset.
  if (exponent < 2 || exponent > MAX_TUBE_EXPONENT) {
    throw new RangeError(`Tube aperture exponent must be between 2 and ${MAX_TUBE_EXPONENT}`)
  }
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
  const closest = closestPointInQuadrant(
    Math.abs(localX),
    Math.abs(localY),
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
