export const MAX_VISUAL_FRAME_DELTA = 0.05

function elapsedSince(time, previousTime) {
  return Number.isFinite(previousTime)
    ? Math.max(0, time - previousTime)
    : 0
}

export function frameDeltas(time, previousVisualTime, previousProgressionTime = previousVisualTime) {
  const visualElapsed = elapsedSince(time, previousVisualTime)
  const progressionElapsed = elapsedSince(time, previousProgressionTime)

  return {
    visual: Math.min(MAX_VISUAL_FRAME_DELTA, visualElapsed),
    progression: progressionElapsed,
  }
}
