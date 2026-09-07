function getRenderedScaleY(reader) {
  const layoutHeight = Number(reader?.offsetHeight || reader?.clientHeight || 0)
  const renderedHeight = Number(reader?.getBoundingClientRect?.().height || 0)
  if (!(layoutHeight > 0) || !(renderedHeight > 0)) return 1

  const scale = renderedHeight / layoutHeight
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

export function installTouchScroll(target, context) {
  const reader = context?.rasteriser?.reader
  const root = target?.ownerDocument?.defaultView || globalThis
  if (!target || !reader || !root?.addEventListener) return () => {}

  const previousTouchAction = target.style.getPropertyValue('touch-action')
  target.style.setProperty('touch-action', 'pinch-zoom')

  let gesture = null
  let globalListenersAttached = false
  let suppressClickUntil = 0

  const detachGlobalListeners = () => {
    if (!globalListenersAttached) return
    globalListenersAttached = false
    root.removeEventListener('pointerdown', onAdditionalPointerDown, true)
    root.removeEventListener('pointermove', onPointerMove)
    root.removeEventListener('pointerup', finishPointer)
    root.removeEventListener('pointercancel', finishPointer)
    root.removeEventListener('blur', cancelGesture)
  }

  const stopGesture = suppressClick => {
    if (!gesture) {
      detachGlobalListeners()
      return
    }

    if (suppressClick && gesture.moved) suppressClickUntil = performance.now() + 400
    gesture = null
    detachGlobalListeners()
  }

  function onAdditionalPointerDown(event) {
    if (!gesture || event.pointerType === 'mouse' || event.pointerId === gesture.pointerId) return
    stopGesture(true)
  }

  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return

    const total = gesture.startY - event.clientY
    const delta = gesture.lastY - event.clientY
    gesture.lastY = event.clientY

    if (!gesture.moved && Math.abs(total) < 6) return

    gesture.moved = true
    if (delta) reader.scrollTop += delta / getRenderedScaleY(reader)
    event.preventDefault()
    event.stopPropagation()
  }

  function finishPointer(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    stopGesture(true)
  }

  function cancelGesture() {
    stopGesture(false)
  }

  const attachGlobalListeners = () => {
    if (globalListenersAttached) return
    globalListenersAttached = true
    root.addEventListener('pointerdown', onAdditionalPointerDown, true)
    root.addEventListener('pointermove', onPointerMove, { passive: false })
    root.addEventListener('pointerup', finishPointer)
    root.addEventListener('pointercancel', finishPointer)
    root.addEventListener('blur', cancelGesture)
  }

  const onPointerDown = event => {
    if (event.pointerType === 'mouse' || event.button > 0 || gesture) return

    gesture = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      moved: false,
    }
    attachGlobalListeners()
  }

  const suppressDraggedClick = event => {
    if (performance.now() > suppressClickUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  target.addEventListener('pointerdown', onPointerDown)
  target.addEventListener('click', suppressDraggedClick, true)

  return () => {
    target.removeEventListener('pointerdown', onPointerDown)
    target.removeEventListener('click', suppressDraggedClick, true)

    // Keep window-level listeners alive until an in-flight pointer ends. The
    // media node may be removed while the finger is still scrolling it.
    if (!gesture) detachGlobalListeners()

    if (previousTouchAction) target.style.setProperty('touch-action', previousTouchAction)
    else target.style.removeProperty('touch-action')
  }
}
