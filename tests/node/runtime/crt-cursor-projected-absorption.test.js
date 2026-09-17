import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CrtCursorController,
  clientPointFromLocalTubeUv,
  createTubeProjection,
  evaluateProjectedTubeAperture,
} from '../../../src/crt-cursor-controller.js'
import { createTubeAperture } from '../../../src/crt-cursor-geometry.js'
import { CRT_CURSOR_STATE } from '../../../src/crt-cursor-state.js'

test('projected capture follows the transformed squircle instead of its client AABB', () => {
  const projection = createTubeProjection({
    rect: { left: 100, top: 50, width: 160, height: 80 },
    localWidth: 200,
    localHeight: 100,
    quad: [
      { x: 100, y: 50 },
      { x: 260, y: 55 },
      { x: 250, y: 130 },
      { x: 110, y: 125 },
    ],
  })
  const aperture = createTubeAperture({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  })

  // This point is inside the transformed axis-aligned bounding box, but maps
  // outside the actual projected squircle near the tilted top-right corner.
  const outside = evaluateProjectedTubeAperture(projection, aperture, 255, 60)
  assert.equal(outside.inside, false)
  assert.ok(outside.signedDistancePx > 0)

  const boundaryClient = clientPointFromLocalTubeUv(projection, 1, 0.5)
  const boundary = evaluateProjectedTubeAperture(
    projection,
    aperture,
    boundaryClient.x,
    boundaryClient.y,
  )
  assert.ok(Math.abs(boundary.signedDistancePx) < 1e-5)
  assert.ok(boundary.inwardNormal.x < 0)
  assert.ok(Number.isFinite(boundary.inwardNormal.y))
})

test('deep re-entry after unwind resumes from visible absorption progress without jumping to Snap', () => {
  const app = {
    state: { powerTarget: 1, crtTarget: 1, fullscreen: false },
    dirty: false,
    crt: {
      ok: true,
      setCursorState() {},
    },
  }
  const controller = new CrtCursorController(app, {
    documentRef: {
      documentElement: { classList: { toggle() {} } },
      body: { classList: { contains: () => false } },
      getElementById: () => null,
    },
    windowRef: {},
    view: {
      update() {},
      show() {},
      hide() {},
      destroy() {},
    },
    finePointerQuery: { matches: true },
    reducedMotionQuery: { matches: false },
  })

  controller.state = CRT_CURSOR_STATE.ABSORBING
  controller.aperture = createTubeAperture({
    left: 0,
    top: 0,
    width: 200,
    height: 120,
  })
  controller.edge = {
    signedDistancePx: 30,
    inside: false,
    inwardNormal: { x: -1, y: 0 },
  }
  controller.zoneLatched = false
  controller.absorption = {
    startedAtMs: 0,
    durationMs: 200,
    progress: 0.75,
    reversing: false,
  }

  controller._frameAbsorption(100, 20)
  const unwound = controller.absorption.progress
  assert.ok(unwound < 0.75)
  assert.ok(unwound > 0)

  controller.edge = {
    signedDistancePx: -10,
    inside: true,
    inwardNormal: { x: -1, y: 0 },
  }
  controller.zoneLatched = true
  controller._frameAbsorption(200, 16)

  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.equal(controller.absorption.reversing, false)
  assert.ok(controller.absorption.progress <= unwound + 1e-6)
  assert.ok(controller.absorption.startedAtMs > 0)
})
