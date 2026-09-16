import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_MAGNETIC_ZONE_PX,
  createTubeAperture,
  evaluateTubeAperture,
  magneticZoneProgress,
  updateMagneticZoneLatch,
} from '../../../src/crt-cursor-geometry.js'
import {
  CRT_CURSOR_EVENT,
  CRT_CURSOR_STATE,
  createPointerMotion,
  cursorCapabilityEligible,
  pointerSpeedAt,
  transitionCursorState,
  updatePointerMotion,
} from '../../../src/crt-cursor-state.js'

const near = (actual, expected, epsilon = 0.02) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`)
}

const aperture = createTubeAperture({
  left: 100,
  top: 50,
  width: 640,
  height: 480,
  bleedX: 12,
  bleedY: 10,
})

test('tube aperture removes picture bleed and returns stable centre geometry', () => {
  assert.deepEqual(aperture.visible, { left: 112, top: 60, width: 616, height: 460 })
  const centre = evaluateTubeAperture(aperture, aperture.centerX, aperture.centerY)
  assert.equal(centre.inside, true)
  assert.ok(centre.signedDistancePx < -200)
  near(centre.normalizedTubeUv.x, 0.5)
  near(centre.normalizedTubeUv.y, 0.5)
})

test('tube aperture restricts the exponent to the authored convex squircle family', () => {
  assert.throws(
    () => createTubeAperture({ left: 0, top: 0, width: 200, height: 200, exponent: 1.5 }),
    /at least 2/,
  )
})

test('superellipse quadrant endpoints stay exact for sharp supported exponents', () => {
  const sharp = createTubeAperture({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    exponent: 20,
  })
  const topEdge = evaluateTubeAperture(sharp, sharp.centerX, sharp.visible.top)
  near(topEdge.signedDistancePx, 0, 1e-9)
  near(topEdge.nearestBoundaryPoint.x, sharp.centerX, 1e-9)
  near(topEdge.nearestBoundaryPoint.y, sharp.visible.top, 1e-9)
})

test('tube aperture signed distance changes sign across straight and curved edges', () => {
  const rightEdge = evaluateTubeAperture(aperture, aperture.visible.left + aperture.visible.width, aperture.centerY)
  assert.ok(Math.abs(rightEdge.signedDistancePx) < 0.02)
  near(rightEdge.inwardNormal.x, -1)
  near(rightEdge.inwardNormal.y, 0)

  const inside = evaluateTubeAperture(aperture, aperture.visible.left + aperture.visible.width - 8, aperture.centerY)
  const outside = evaluateTubeAperture(aperture, aperture.visible.left + aperture.visible.width + 8, aperture.centerY)
  assert.ok(inside.signedDistancePx < 0)
  assert.ok(outside.signedDistancePx > 0)
  near(Math.abs(inside.signedDistancePx), 8, 0.05)
  near(outside.signedDistancePx, 8, 0.05)

  const cornerOutside = evaluateTubeAperture(aperture, aperture.visible.left, aperture.visible.top)
  assert.equal(cornerOutside.inside, false)
  assert.ok(cornerOutside.signedDistancePx > 0)
  assert.ok(cornerOutside.nearestBoundaryPoint.x > aperture.visible.left)
  assert.ok(cornerOutside.nearestBoundaryPoint.y > aperture.visible.top)
  assert.ok(cornerOutside.inwardNormal.x > 0)
  assert.ok(cornerOutside.inwardNormal.y > 0)
})

test('tube aperture searches all local distance minima for interior points', () => {
  const point = evaluateTubeAperture(aperture, aperture.centerX + 140, aperture.centerY + 45)
  assert.equal(point.inside, true)
  near(point.nearestBoundaryPoint.x, aperture.centerX + 306.67455, 0.03)
  near(point.nearestBoundaryPoint.y, aperture.centerY + 57.05736, 0.03)
  near(point.signedDistancePx, -167.1101, 0.03)

  const nudged = evaluateTubeAperture(aperture, aperture.centerX + 140.1, aperture.centerY + 45)
  assert.ok(Math.abs(nudged.nearestBoundaryPoint.x - point.nearestBoundaryPoint.x) < 0.2)
  assert.ok(Math.abs(nudged.nearestBoundaryPoint.y - point.nearestBoundaryPoint.y) < 0.2)
})

test('tube aperture refines minima adjacent to both quadrant endpoints', () => {
  const nearHorizontalAxis = evaluateTubeAperture(
    aperture,
    aperture.centerX + aperture.halfWidth - 1,
    aperture.centerY + 3,
  )
  assert.equal(nearHorizontalAxis.inside, true)
  near(nearHorizontalAxis.nearestBoundaryPoint.x, aperture.centerX + 307.99986, 0.02)
  near(nearHorizontalAxis.nearestBoundaryPoint.y, aperture.centerY + 3.00015, 0.02)
  near(nearHorizontalAxis.signedDistancePx, -0.99986, 0.02)
  assert.ok(nearHorizontalAxis.signedDistancePx > -aperture.snapDepthPx)

  const nearVerticalAxis = evaluateTubeAperture(
    aperture,
    aperture.centerX + 3,
    aperture.centerY + aperture.halfHeight - 1,
  )
  assert.equal(nearVerticalAxis.inside, true)
  assert.ok(nearVerticalAxis.nearestBoundaryPoint.x > aperture.centerX)
  assert.ok(nearVerticalAxis.nearestBoundaryPoint.y > aperture.centerY + aperture.halfHeight - 0.05)
  near(nearVerticalAxis.signedDistancePx, -1, 0.03)
  assert.ok(nearVerticalAxis.signedDistancePx > -aperture.snapDepthPx)
})

test('normalized tube UV remains geometric outside the aperture instead of clamping', () => {
  const point = evaluateTubeAperture(aperture, aperture.visible.left - 10, aperture.centerY)
  assert.ok(point.normalizedTubeUv.x < 0)
  near(point.normalizedTubeUv.y, 0.5)
})

test('Magnetic Zone progress spans the configured outside-to-snap interval', () => {
  assert.equal(magneticZoneProgress(aperture, DEFAULT_MAGNETIC_ZONE_PX + 1), 0)
  near(magneticZoneProgress(aperture, DEFAULT_MAGNETIC_ZONE_PX), 0)
  assert.ok(magneticZoneProgress(aperture, 5) > 0)
  assert.ok(magneticZoneProgress(aperture, 5) < 1)
  near(magneticZoneProgress(aperture, -aperture.snapDepthPx), 1)
  assert.equal(magneticZoneProgress(aperture, -20), 1)
})

test('Magnetic Zone latch adds hysteresis and ignores rapid threshold oscillation', () => {
  let captured = false
  captured = updateMagneticZoneLatch(aperture, captured, 17)
  assert.equal(captured, false)
  captured = updateMagneticZoneLatch(aperture, captured, 15.9)
  assert.equal(captured, true)

  for (const distance of [16.2, 15.8, 17.5, 19.9, 16.1]) {
    captured = updateMagneticZoneLatch(aperture, captured, distance)
    assert.equal(captured, true)
  }

  captured = updateMagneticZoneLatch(aperture, captured, 20.1)
  assert.equal(captured, false)
})

test('fine-pointer eligibility excludes coarse/touch interaction', () => {
  assert.equal(cursorCapabilityEligible({ canHover: true, finePointer: true, pointerType: 'mouse' }), true)
  assert.equal(cursorCapabilityEligible({ canHover: true, finePointer: true, pointerType: 'pen' }), true)
  assert.equal(cursorCapabilityEligible({ canHover: false, finePointer: true, pointerType: 'mouse' }), false)
  assert.equal(cursorCapabilityEligible({ canHover: true, finePointer: false, pointerType: 'mouse' }), false)
  assert.equal(cursorCapabilityEligible({ canHover: true, finePointer: true, pointerType: 'touch' }), false)
})

test('first real pointer sample seeds motion without inventing an angle from the origin', () => {
  let motion = createPointerMotion()
  motion = updatePointerMotion(motion, { x: 300, y: 200, timeMs: 100 })
  assert.equal(motion.hasStableAngle, false)
  assert.equal(motion.speedPxPerMs, 0)
  near(motion.angle, 0, 1e-9)
  assert.equal(motion.previousX, 300)
  assert.equal(motion.previousY, 200)
  assert.equal(motion.angleReferenceX, 300)
  assert.equal(motion.angleReferenceY, 200)

  motion = updatePointerMotion(motion, { x: 310, y: 200, timeMs: 116 })
  assert.equal(motion.hasStableAngle, true)
  near(motion.angle, 0, 1e-9)
})

test('pointer motion accumulates sub-threshold samples before updating direction', () => {
  let motion = createPointerMotion({ x: 0, y: 0, timeMs: 0 })

  motion = updatePointerMotion(motion, { x: 0, y: 0.5, timeMs: 1 })
  assert.equal(motion.hasStableAngle, false)
  assert.equal(motion.angleReferenceY, 0)

  motion = updatePointerMotion(motion, { x: 0, y: 1, timeMs: 2 })
  assert.equal(motion.hasStableAngle, true)
  near(motion.angle, Math.PI * 0.5, 1e-9)
  assert.equal(motion.angleReferenceY, 1)

  for (let index = 3; index <= 100; index += 1) {
    motion = updatePointerMotion(motion, { x: 0, y: index * 0.5, timeMs: index })
  }

  assert.equal(motion.hasStableAngle, true)
  near(motion.angle, Math.PI * 0.5, 1e-9)
  near(motion.y, 50, 1e-9)
})

test('pointer motion filters speed, clamps spikes and preserves the last stable angle at rest', () => {
  let motion = createPointerMotion({ x: 10, y: 10, timeMs: 0 })
  motion = updatePointerMotion(motion, { x: 20, y: 10, timeMs: 16 })
  assert.equal(motion.hasStableAngle, true)
  near(motion.angle, 0, 1e-9)
  assert.ok(motion.speedPxPerMs > 0)

  const rememberedAngle = motion.angle
  motion = updatePointerMotion(motion, { x: 20.2, y: 10.1, timeMs: 32 })
  near(motion.angle, rememberedAngle, 1e-9)

  const spike = updatePointerMotion(motion, { x: 10020, y: 10, timeMs: 33 }, { maxSpeedPxPerMs: 2 })
  assert.ok(spike.speedPxPerMs <= 2)
  assert.ok(spike.speedPxPerMs >= motion.speedPxPerMs)
})

test('filtered pointer speed decays to rest without additional pointer events', () => {
  let motion = createPointerMotion({ x: 0, y: 0, timeMs: 0 })
  motion = updatePointerMotion(motion, { x: 30, y: 0, timeMs: 16 })
  assert.ok(motion.speedPxPerMs > 0)
  near(pointerSpeedAt(motion, 16), motion.speedPxPerMs, 1e-12)

  const decayed = pointerSpeedAt(motion, 116)
  assert.ok(decayed > 0)
  assert.ok(decayed < motion.speedPxPerMs)
  assert.equal(pointerSpeedAt(motion, 1016), 0)
})

test('cursor state machine supports capture, reversal, snap and release cancellation', () => {
  let state = CRT_CURSOR_STATE.NATIVE_OUTSIDE
  state = transitionCursorState(state, CRT_CURSOR_EVENT.CAPTURE_START)
  assert.equal(state, CRT_CURSOR_STATE.ABSORBING)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.CAPTURE_CANCEL)
  assert.equal(state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)

  state = transitionCursorState(state, CRT_CURSOR_EVENT.CAPTURE_START)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.SNAP)
  assert.equal(state, CRT_CURSOR_STATE.CRT_ACTIVE)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.RELEASE_START)
  assert.equal(state, CRT_CURSOR_STATE.RELEASING)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.RELEASE_CANCEL)
  assert.equal(state, CRT_CURSOR_STATE.CRT_ACTIVE)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.RELEASE_START)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.RELEASE_COMPLETE)
  assert.equal(state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
})

test('power off always cancels cursor ownership to native outside', () => {
  for (const state of Object.values(CRT_CURSOR_STATE)) {
    assert.equal(
      transitionCursorState(state, CRT_CURSOR_EVENT.POWER_OFF),
      CRT_CURSOR_STATE.NATIVE_OUTSIDE,
    )
  }
})

test('reduced-motion direct events skip cinematic states', () => {
  let state = transitionCursorState(CRT_CURSOR_STATE.NATIVE_OUTSIDE, CRT_CURSOR_EVENT.DIRECT_ENTER)
  assert.equal(state, CRT_CURSOR_STATE.CRT_ACTIVE)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.DIRECT_EXIT)
  assert.equal(state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
})

test('external ownership falls back to native and resumes without physical boundary replay', () => {
  let state = transitionCursorState(CRT_CURSOR_STATE.NATIVE_OUTSIDE, CRT_CURSOR_EVENT.EXTERNAL_TAKEOVER)
  assert.equal(state, CRT_CURSOR_STATE.NATIVE_EXTERNAL)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.EXTERNAL_RETURN_INSIDE)
  assert.equal(state, CRT_CURSOR_STATE.CRT_ACTIVE)

  state = transitionCursorState(state, CRT_CURSOR_EVENT.EXTERNAL_TAKEOVER)
  assert.equal(state, CRT_CURSOR_STATE.NATIVE_EXTERNAL)
  state = transitionCursorState(state, CRT_CURSOR_EVENT.EXTERNAL_RETURN_OUTSIDE)
  assert.equal(state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
})

test('invalid events do not force illegal state jumps', () => {
  assert.equal(
    transitionCursorState(CRT_CURSOR_STATE.NATIVE_OUTSIDE, CRT_CURSOR_EVENT.SNAP),
    CRT_CURSOR_STATE.NATIVE_OUTSIDE,
  )
  assert.equal(
    transitionCursorState(CRT_CURSOR_STATE.CRT_ACTIVE, CRT_CURSOR_EVENT.CAPTURE_START),
    CRT_CURSOR_STATE.CRT_ACTIVE,
  )
})
