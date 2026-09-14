import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_VISUAL_FRAME_DELTA, frameDeltas } from '../../../src/frame-timing.js'

test('frame timing keeps animation progression stable across frame conditions', () => {
  const first = frameDeltas(10, undefined)
  assert.deepEqual(first, { visual: 0, progression: 0 })

  const normal = frameDeltas(10.016, 10)
  assert.ok(Math.abs(normal.visual - 0.016) < 1e-9)
  assert.ok(Math.abs(normal.progression - 0.016) < 1e-9)

  const dropped = frameDeltas(10.2, 10)
  assert.equal(dropped.visual, MAX_VISUAL_FRAME_DELTA)
  assert.ok(Math.abs(dropped.progression - 0.2) < 1e-9)

  const resetDuringDroppedFrame = frameDeltas(10.2, 10, 10.18)
  assert.equal(resetDuringDroppedFrame.visual, MAX_VISUAL_FRAME_DELTA)
  assert.ok(Math.abs(resetDuringDroppedFrame.progression - 0.02) < 1e-9)

  const revealSpeed = 900
  const revealAfterDroppedFrame = revealSpeed * dropped.progression
  assert.ok(Math.abs(revealAfterDroppedFrame - 180) < 1e-9)

  const reversed = frameDeltas(9.9, 10)
  assert.deepEqual(reversed, { visual: 0, progression: 0 })
})
