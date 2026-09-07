export function installTouchScroll(target, context) {
  const reader = context?.rasteriser?.reader
  if (!target || !reader) return () => {}

  const previousTouchAction = target.style.touchAction
  target.style.touchAction = 'none'

  let gesture = null
  let suppressClickUntil = 0

  const onPointerDown = event => {
    if (event.pointerType === 'mouse' || event.button > 0) return

    gesture = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      moved: false,
    }

    try { target.setPointerCapture?.(event.pointerId) } catch {}
  }

  const onPointerMove = event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return

    const total = gesture.startY - event.clientY
    const delta = gesture.lastY - event.clientY
    gesture.lastY = event.clientY

    if (!gesture.moved && Math.abs(total) < 6) return

    gesture.moved = true
    if (delta) reader.scrollTop += delta
    event.preventDefault()
    event.stopPropagation()
  }

  const finishPointer = event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return

    if (gesture.moved) suppressClickUntil = performance.now() + 400
    try { target.releasePointerCapture?.(event.pointerId) } catch {}
    gesture = null
  }

  const suppressDraggedClick = event => {
    if (performance.now() > suppressClickUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  target.addEventListener('pointerdown', onPointerDown)
  target.addEventListener('pointermove', onPointerMove)
  target.addEventListener('pointerup', finishPointer)
  target.addEventListener('pointercancel', finishPointer)
  target.addEventListener('click', suppressDraggedClick, true)

  return () => {
    target.removeEventListener('pointerdown', onPointerDown)
    target.removeEventListener('pointermove', onPointerMove)
    target.removeEventListener('pointerup', finishPointer)
    target.removeEventListener('pointercancel', finishPointer)
    target.removeEventListener('click', suppressDraggedClick, true)

    if (previousTouchAction) target.style.touchAction = previousTouchAction
    else target.style.removeProperty('touch-action')
  }
}
