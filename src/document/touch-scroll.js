const touchScrollCoordinators = new WeakMap()

function getRenderedScaleY(reader) {
  const layoutHeight = Number(reader?.offsetHeight || reader?.clientHeight || 0)
  const renderedHeight = Number(reader?.getBoundingClientRect?.().height || 0)
  if (!(layoutHeight > 0) || !(renderedHeight > 0)) return 1

  const scale = renderedHeight / layoutHeight
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

function getTouchScrollCoordinator(reader, root) {
  const existing = touchScrollCoordinators.get(reader)
  if (existing) return existing

  const activePointers = new Set()
  let gesture = null
  let multiTouch = false
  let registrations = 0
  let listenersAttached = false

  const endGesture = suppressClick => {
    const current = gesture
    if (!current) return

    if (suppressClick && current.moved) current.suppressClick()
    gesture = null
  }

  const maybeDetachListeners = () => {
    if (!listenersAttached || registrations > 0 || activePointers.size > 0) return

    listenersAttached = false
    root.removeEventListener('pointerdown', onPointerDown, true)
    root.removeEventListener('pointermove', onPointerMove, true)
    root.removeEventListener('pointerup', onPointerEnd, true)
    root.removeEventListener('pointercancel', onPointerEnd, true)
    root.removeEventListener('blur', onBlur)
    touchScrollCoordinators.delete(reader)
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' || event.button > 0) return

    activePointers.add(event.pointerId)
    if (activePointers.size <= 1) return

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

  function onPointerEnd(event) {
    if (gesture?.pointerId === event.pointerId) endGesture(true)

    activePointers.delete(event.pointerId)
    if (activePointers.size > 0) return

    multiTouch = false
    maybeDetachListeners()
  }

  function onBlur() {
    activePointers.clear()
    multiTouch = false
    endGesture(false)
    maybeDetachListeners()
  }

  const attachListeners = () => {
    if (listenersAttached) return

    listenersAttached = true
    root.addEventListener('pointerdown', onPointerDown, true)
    root.addEventListener('pointermove', onPointerMove, { capture: true, passive: false })
    root.addEventListener('pointerup', onPointerEnd, true)
    root.addEventListener('pointercancel', onPointerEnd, true)
    root.addEventListener('blur', onBlur)
  }

  const coordinator = {
    register() {
      registrations++
      attachListeners()

      let released = false
      return () => {
        if (released) return
        released = true
        registrations = Math.max(0, registrations - 1)
        maybeDetachListeners()
      }
    },

    startGesture(event, suppressClick) {
      if (event.pointerType === 'mouse' || event.button > 0) return false

      // Pointer capture on window normally records this contact first. Keeping
      // this add makes direct/synthetic dispatch follow the same state model.
      activePointers.add(event.pointerId)
      if (multiTouch || activePointers.size > 1 || gesture) return false

      gesture = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        moved: false,
        suppressClick,
      }
      return true
    },
  }

  touchScrollCoordinators.set(reader, coordinator)
  return coordinator
}

export function installTouchScroll(target, context) {
  const reader = context?.rasteriser?.reader
  const root = target?.ownerDocument?.defaultView || globalThis
  if (!target || !reader || !root?.addEventListener) return () => {}

  const previousTouchAction = target.style.getPropertyValue('touch-action')
  target.style.setProperty('touch-action', 'pinch-zoom')

  const coordinator = getTouchScrollCoordinator(reader, root)
  const releaseCoordinator = coordinator.register()
  let suppressClickUntil = 0

  const onPointerDown = event => {
    const started = coordinator.startGesture(event, () => {
      suppressClickUntil = performance.now() + 400
    })

    if (started) {
      // A new physical contact is a new interaction. Any synthetic click from
      // a previous drag has already been dispatched before this pointerdown.
      suppressClickUntil = 0
    }
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
    releaseCoordinator()

    if (previousTouchAction) target.style.setProperty('touch-action', previousTouchAction)
    else target.style.removeProperty('touch-action')
  }
}
