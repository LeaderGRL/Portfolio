import { MAX_VISUAL_FRAME_DELTA, frameDeltas } from '../src/frame-timing.js'

let failed = 0

function check(condition, label) {
  console.log(`  ${label.padEnd(62)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const first = frameDeltas(10, undefined)
check(first.visual === 0 && first.progression === 0, 'first frame starts without a synthetic delta')

const normal = frameDeltas(10.016, 10)
check(Math.abs(normal.visual - 0.016) < 1e-9, 'normal frames keep their visual delta')
check(Math.abs(normal.progression - 0.016) < 1e-9, 'normal frames keep their progression delta')

const dropped = frameDeltas(10.2, 10)
check(dropped.visual === MAX_VISUAL_FRAME_DELTA, 'long frames keep visual effects clamped')
check(Math.abs(dropped.progression - 0.2) < 1e-9, 'long frames preserve wall-clock progression')

const resetDuringDroppedFrame = frameDeltas(10.2, 10, 10.18)
check(resetDuringDroppedFrame.visual === MAX_VISUAL_FRAME_DELTA, 'reveal resets do not change the visual clamp')
check(Math.abs(resetDuringDroppedFrame.progression - 0.02) < 1e-9, 'reveal resets discard elapsed time before the reset')

const revealSpeed = 900
const revealAfterDroppedFrame = revealSpeed * dropped.progression
check(Math.abs(revealAfterDroppedFrame - 180) < 1e-9, 'reveal speed stays wall-clock stable across a 200ms frame')

const reversed = frameDeltas(9.9, 10)
check(reversed.visual === 0 && reversed.progression === 0, 'backward timestamps never reverse animation progress')

if (failed) {
  console.error(`\n  ${failed} frame-timing check(s) failed`)
  process.exit(1)
}

console.log('\n  all frame-timing checks passed')
