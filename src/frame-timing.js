export const MAX_VISUAL_FRAME_DELTA = 0.05

export function frameDeltas(time, previousTime) {
  const elapsed = Number.isFinite(previousTime)
    ? Math.max(0, time - previousTime)
    : 0

  return {
    visual: Math.min(MAX_VISUAL_FRAME_DELTA, elapsed),
    progression: elapsed,
  }
}

