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

  const activePointers = new Set()
  let gesture = null
  let multiTouch = false
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

  const endGesture = suppressClick => {
    if (suppressClick && gesture?.moved) suppressClickUntil = performance.now() + 400
    gesture = null
  }

  function onAdditionalPointerDown(event) {
    if (event.pointerType === 'mouse' || event.button > 0) return

    activePointers.add(event.pointerId)
    if (!gesture || event.pointerId === gesture.pointerId) return

    // Keep the multi-touch lock until every contact has ended. The same second
    // pointerdown will continue from window capture to the media target.
    multiTouch = true
    endGesture(true)
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
    const ownsGesture = gesture?.pointerId === event.pointerId
    if (ownsGesture) endGesture(true)

    activePointers.delete(event.pointerId)
    if (activePointers.size > 0) return

    multiTouch = false
    detachGlobalListeners()
  }

  function cancelGesture() {
    activePointers.clear()
    multiTouch = false
    endGesture(false)
    detachGlobalListeners()
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
    if (event.pointerType === 'mouse' || event.button > 0) return

    activePointers.add(event.pointerId)
    if (multiTouch || activePointers.size > 1 || gesture) return

    // A new physical contact is a new interaction. Any synthetic click from a
    // previous drag has already been dispatched before this pointerdown.
    suppressClickUntil = 0
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

    // Keep window-level listeners alive until every in-flight pointer ends. A
    // media node may be removed while a swipe or pinch is still in progress.
    if (activePointers.size === 0) detachGlobalListeners()

    if (previousTouchAction) target.style.setProperty('touch-action', previousTouchAction)
    else target.style.removeProperty('touch-action')
  }
}
