import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_TUBE_EXPONENT,
  createTubeAperture,
  evaluateTubeAperture,
} from '../../../src/crt-cursor-geometry.js'

const near = (actual, expected, epsilon = 0.002) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`)
}

test('max supported exponent preserves sub-snap accuracy extremely close to an axis', () => {
  const aperture = createTubeAperture({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    exponent: MAX_TUBE_EXPONENT,
  })

  const point = evaluateTubeAperture(aperture, 198.1, 100.7)

  assert.equal(point.inside, true)
  near(point.nearestBoundaryPoint.x, 200)
  near(point.nearestBoundaryPoint.y, 100.7)
  near(point.signedDistancePx, -1.9)
  assert.ok(point.signedDistancePx > -aperture.snapDepthPx)
})
