export function createPointerSampleBuffer(windowRef = globalThis.window) {
  let active = false
  let latestSample = null

  const record = event => {
    if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return
    latestSample = {
      clientX: event.clientX,
      clientY: event.clientY,
      timeStamp: Number.isFinite(event.timeStamp) ? event.timeStamp : 0,
      pointerType: event.pointerType || 'mouse',
      target: event.target || null,
    }
  }

  return {
    start() {
      if (active || !windowRef?.addEventListener) return this
      active = true
      windowRef.addEventListener('pointermove', record, { passive: true, capture: true })
      windowRef.addEventListener('pointerover', record, { passive: true, capture: true })
      return this
    },

    stop() {
      if (!active) return this
      windowRef?.removeEventListener?.('pointermove', record, true)
      windowRef?.removeEventListener?.('pointerover', record, true)
      active = false
      return this
    },

    peek() {
      return latestSample
    },

    consume() {
      const sample = latestSample
      latestSample = null
      return sample
    },
  }
}
