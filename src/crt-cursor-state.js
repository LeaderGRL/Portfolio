const clamp = (value, min, max) => value < min ? min : value > max ? max : value

export const FINE_POINTER_MEDIA_QUERY = '(hover: hover) and (pointer: fine)'

export const CRT_CURSOR_STATE = Object.freeze({
  NATIVE_OUTSIDE: 'NATIVE_OUTSIDE',
  ABSORBING: 'ABSORBING',
  CRT_ACTIVE: 'CRT_ACTIVE',
  RELEASING: 'RELEASING',
  NATIVE_EXTERNAL: 'NATIVE_EXTERNAL',
})

export const CRT_CURSOR_EVENT = Object.freeze({
  CAPTURE_START: 'CAPTURE_START',
  CAPTURE_CANCEL: 'CAPTURE_CANCEL',
  SNAP: 'SNAP',
  RELEASE_START: 'RELEASE_START',
  RELEASE_CANCEL: 'RELEASE_CANCEL',
  RELEASE_COMPLETE: 'RELEASE_COMPLETE',
  DIRECT_ENTER: 'DIRECT_ENTER',
  DIRECT_EXIT: 'DIRECT_EXIT',
  EXTERNAL_TAKEOVER: 'EXTERNAL_TAKEOVER',
  EXTERNAL_RETURN_INSIDE: 'EXTERNAL_RETURN_INSIDE',
  EXTERNAL_RETURN_OUTSIDE: 'EXTERNAL_RETURN_OUTSIDE',
  POWER_OFF: 'POWER_OFF',
})

const LEGAL_TRANSITIONS = Object.freeze({
  [CRT_CURSOR_STATE.NATIVE_OUTSIDE]: Object.freeze({
    [CRT_CURSOR_EVENT.CAPTURE_START]: CRT_CURSOR_STATE.ABSORBING,
    [CRT_CURSOR_EVENT.DIRECT_ENTER]: CRT_CURSOR_STATE.CRT_ACTIVE,
    [CRT_CURSOR_EVENT.EXTERNAL_TAKEOVER]: CRT_CURSOR_STATE.NATIVE_EXTERNAL,
  }),
  [CRT_CURSOR_STATE.ABSORBING]: Object.freeze({
    [CRT_CURSOR_EVENT.CAPTURE_CANCEL]: CRT_CURSOR_STATE.NATIVE_OUTSIDE,
    [CRT_CURSOR_EVENT.SNAP]: CRT_CURSOR_STATE.CRT_ACTIVE,
    [CRT_CURSOR_EVENT.EXTERNAL_TAKEOVER]: CRT_CURSOR_STATE.NATIVE_EXTERNAL,
  }),
  [CRT_CURSOR_STATE.CRT_ACTIVE]: Object.freeze({
    [CRT_CURSOR_EVENT.RELEASE_START]: CRT_CURSOR_STATE.RELEASING,
    [CRT_CURSOR_EVENT.DIRECT_EXIT]: CRT_CURSOR_STATE.NATIVE_OUTSIDE,
    [CRT_CURSOR_EVENT.EXTERNAL_TAKEOVER]: CRT_CURSOR_STATE.NATIVE_EXTERNAL,
  }),
  [CRT_CURSOR_STATE.RELEASING]: Object.freeze({
    [CRT_CURSOR_EVENT.RELEASE_CANCEL]: CRT_CURSOR_STATE.CRT_ACTIVE,
    [CRT_CURSOR_EVENT.RELEASE_COMPLETE]: CRT_CURSOR_STATE.NATIVE_OUTSIDE,
    [CRT_CURSOR_EVENT.EXTERNAL_TAKEOVER]: CRT_CURSOR_STATE.NATIVE_EXTERNAL,
  }),
  [CRT_CURSOR_STATE.NATIVE_EXTERNAL]: Object.freeze({
    [CRT_CURSOR_EVENT.EXTERNAL_RETURN_INSIDE]: CRT_CURSOR_STATE.CRT_ACTIVE,
    [CRT_CURSOR_EVENT.EXTERNAL_RETURN_OUTSIDE]: CRT_CURSOR_STATE.NATIVE_OUTSIDE,
  }),
})

export function cursorCapabilityEligible({ canHover, finePointer, pointerType = 'mouse' }) {
  return Boolean(canHover && finePointer && pointerType !== 'touch')
}

export function transitionCursorState(state, event) {
  if (!Object.values(CRT_CURSOR_STATE).includes(state)) throw new TypeError(`Unknown CRT cursor state: ${state}`)
  if (!Object.values(CRT_CURSOR_EVENT).includes(event)) throw new TypeError(`Unknown CRT cursor event: ${event}`)
  if (event === CRT_CURSOR_EVENT.POWER_OFF) return CRT_CURSOR_STATE.NATIVE_OUTSIDE
  return LEGAL_TRANSITIONS[state]?.[event] || state
}

export function createPointerMotion({ x = 0, y = 0, timeMs = null, angle = 0 } = {}) {
  return {
    x,
    y,
    previousX: x,
    previousY: y,
    angleReferenceX: x,
    angleReferenceY: y,
    speedReferenceX: x,
    speedReferenceY: y,
    speedReferenceTimeMs: timeMs,
    timeMs,
    speedPxPerMs: 0,
    angle,
    hasStableAngle: false,
  }
}

/**
 * Read filtered speed at an arbitrary time. Pointer events update the speed
 * estimate; animation-frame consumers use this helper so a stopped pointer
 * decays toward rest even when the browser emits no more pointermove events.
 */
export function pointerSpeedAt(motion, timeMs, {
  speedDecayHz = 18,
  stopEpsilonPxPerMs = 0.0001,
} = {}) {
  if (!motion || !Number.isFinite(timeMs) || !Number.isFinite(motion.speedPxPerMs)) {
    throw new TypeError('Pointer speed read requires a motion model and finite timeMs')
  }
  if (speedDecayHz < 0 || stopEpsilonPxPerMs < 0) {
    throw new RangeError('Pointer speed decay values must be non-negative')
  }
  if (motion.timeMs == null || motion.speedPxPerMs <= 0) return 0

  const elapsedMs = Math.max(0, timeMs - motion.timeMs)
  const speed = motion.speedPxPerMs * Math.exp(-(elapsedMs / 1000) * speedDecayHz)
  return speed <= stopEpsilonPxPerMs ? 0 : speed
}

/**
 * Advance the pointer sample without owning DOM or rendering state. The future
 * controller can feed this pure model from pointer events or deterministic
 * tests while keeping the browser hotspot authoritative.
 */
export function updatePointerMotion(previous, sample, {
  angleThresholdPx = 0.75,
  speedResponseHz = 18,
  maxSpeedPxPerMs = 3,
} = {}) {
  if (!previous || !sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)
    || !Number.isFinite(sample.timeMs)) {
    throw new TypeError('Pointer motion update requires finite x, y and timeMs values')
  }
  if (angleThresholdPx < 0 || speedResponseHz < 0 || maxSpeedPxPerMs < 0) {
    throw new RangeError('Pointer motion thresholds and speed values must be non-negative')
  }

  // A model without a timestamp has not observed real movement yet. Seed the
  // first browser sample without inventing a direction from the default origin.
  if (previous.timeMs == null) {
    return {
      x: sample.x,
      y: sample.y,
      previousX: sample.x,
      previousY: sample.y,
      angleReferenceX: sample.x,
      angleReferenceY: sample.y,
      speedReferenceX: sample.x,
      speedReferenceY: sample.y,
      speedReferenceTimeMs: sample.timeMs,
      timeMs: sample.timeMs,
      speedPxPerMs: 0,
      angle: previous.angle,
      hasStableAngle: previous.hasStableAngle,
    }
  }

  const referenceX = Number.isFinite(previous.angleReferenceX) ? previous.angleReferenceX : previous.x
  const referenceY = Number.isFinite(previous.angleReferenceY) ? previous.angleReferenceY : previous.y
  const angleDx = sample.x - referenceX
  const angleDy = sample.y - referenceY
  const angleDistance = Math.hypot(angleDx, angleDy)

  let angle = previous.angle
  let hasStableAngle = previous.hasStableAngle
  let angleReferenceX = referenceX
  let angleReferenceY = referenceY
  if (angleDistance > 0 && angleDistance >= angleThresholdPx) {
    angle = Math.atan2(angleDy, angleDx)
    hasStableAngle = true
    angleReferenceX = sample.x
    angleReferenceY = sample.y
  }

  // Timer precision can produce several pointer samples with the same
  // timestamp. Keep a separate speed baseline so movement from those samples
  // is accumulated instead of disappearing when the visible position advances.
  let speedReferenceX = Number.isFinite(previous.speedReferenceX) ? previous.speedReferenceX : previous.x
  let speedReferenceY = Number.isFinite(previous.speedReferenceY) ? previous.speedReferenceY : previous.y
  let speedReferenceTimeMs = Number.isFinite(previous.speedReferenceTimeMs)
    ? previous.speedReferenceTimeMs
    : previous.timeMs
  let speedPxPerMs = previous.speedPxPerMs

  const speedDtMs = sample.timeMs - speedReferenceTimeMs
  if (speedDtMs > 0) {
    const speedDistance = Math.hypot(sample.x - speedReferenceX, sample.y - speedReferenceY)
    const instantSpeed = clamp(speedDistance / speedDtMs, 0, maxSpeedPxPerMs)
    const response = 1 - Math.exp(-(speedDtMs / 1000) * speedResponseHz)
    speedPxPerMs += (instantSpeed - speedPxPerMs) * response
    speedReferenceX = sample.x
    speedReferenceY = sample.y
    speedReferenceTimeMs = sample.timeMs
  }

  return {
    x: sample.x,
    y: sample.y,
    previousX: previous.x,
    previousY: previous.y,
    angleReferenceX,
    angleReferenceY,
    speedReferenceX,
    speedReferenceY,
    speedReferenceTimeMs,
    timeMs: sample.timeMs,
    speedPxPerMs,
    angle,
    hasStableAngle,
  }
}
