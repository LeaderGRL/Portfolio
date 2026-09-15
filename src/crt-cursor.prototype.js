/*
 * PROTOTYPE ONLY — throwaway UI exploration.
 *
 * Question: which CRT-only capture transition best preserves a normal desktop
 * pointer on the physical chassis while making the pointer feel converted into
 * an electronic signal once it is fully inside the tube?
 *
 * The operating-system cursor remains untouched outside the CRT. Once the
 * pointer is fully inside the safe aperture, this prototype hides the native
 * cursor and substitutes a classic arrow below the real glass layers. The
 * production implementation should render that arrow through the CRT shader.
 */

import './crt-cursor.prototype.css'

const VARIANTS = ['A', 'B', 'C']
const NAMES = {
  A: 'Phosphor Lock',
  B: 'Signal Split',
  C: 'Beam Imprint',
}
const SAFE_MARGIN = 20
const TRANSITION_MS = { A: 145, B: 170, C: 155 }
const TRAIL_COUNT = 4

const finePointer = matchMedia('(hover: hover) and (pointer: fine)')

function normalizeVariant(value) {
  const candidate = String(value || '').toUpperCase()
  return VARIANTS.includes(candidate) ? candidate : 'A'
}

function readVariant() {
  return normalizeVariant(new URL(location.href).searchParams.get('variant'))
}

function writeVariant(variant) {
  const url = new URL(location.href)
  url.searchParams.set('variant', variant)
  history.replaceState(null, '', url)
}

function createArrow(className) {
  const element = document.createElement('div')
  element.className = className
  element.innerHTML = '<span class="crt-cursor-prototype__arrow" aria-hidden="true"></span>'
  return element
}

function createTrailNode(parent, index) {
  const node = document.createElement('i')
  node.className = 'crt-cursor-prototype__trail-node'
  node.dataset.trailIndex = String(index)
  parent.append(node)
  return node
}

function installPrototype() {
  if (!import.meta.env.DEV || !finePointer.matches || innerWidth < 900) return

  const tube = document.querySelector('#tube')
  const glass = tube?.querySelector('.tube__shade')
  if (!tube || !glass) return

  const root = document.documentElement
  root.classList.add('crt-cursor-prototype')

  let variant = readVariant()
  root.dataset.cursorVariant = variant

  const inside = createArrow('crt-cursor-prototype__inside')
  const capture = document.createElement('div')
  capture.className = 'crt-cursor-prototype__capture'
  capture.innerHTML = '<i></i><i></i><i></i>'
  tube.insertBefore(inside, glass)
  tube.insertBefore(capture, glass)

  const insideTrail = Array.from({ length: TRAIL_COUNT }, (_, index) =>
    createTrailNode(tube, index),
  )

  const hud = document.createElement('aside')
  hud.className = 'crt-cursor-prototype__hud'
  hud.innerHTML = `
    <strong>CRT CURSOR — THROWAWAY PROTOTYPE</strong><br>
    Native cursor on chassis · CRT cursor only after full aperture entry.
    <div class="crt-cursor-prototype__hud-status">
      <span>VARIANT</span><b data-proto-variant></b>
      <span>STATE</span><b data-proto-state>OUTSIDE</b>
      <span>SPEED</span><b data-proto-speed>0.00</b>
    </div>`
  document.body.append(hud)

  const switcher = document.createElement('nav')
  switcher.className = 'crt-cursor-prototype__switcher'
  switcher.setAttribute('aria-label', 'CRT cursor prototype variants')
  switcher.innerHTML = `
    <button type="button" data-proto-prev aria-label="Previous CRT transition">←</button>
    <span data-proto-label></span>
    <button type="button" data-proto-next aria-label="Next CRT transition">→</button>`
  document.body.append(switcher)

  const hudVariant = hud.querySelector('[data-proto-variant]')
  const hudState = hud.querySelector('[data-proto-state]')
  const hudSpeed = hud.querySelector('[data-proto-speed]')
  const switcherLabel = switcher.querySelector('[data-proto-label]')

  const pointer = {
    x: innerWidth * .5,
    y: innerHeight * .5,
    previousX: innerWidth * .5,
    previousY: innerHeight * .5,
    speed: 0,
    active: false,
  }

  const samples = Array.from({ length: TRAIL_COUNT + 1 }, () => ({
    x: pointer.x,
    y: pointer.y,
  }))

  let state = 'OUTSIDE'
  let transitionToken = 0
  let captureTimer = 0
  let lastFrame = performance.now()

  function updatePrototypeLabels() {
    root.dataset.cursorVariant = variant
    hudVariant.textContent = `${variant} — ${NAMES[variant]}`
    switcherLabel.textContent = `${variant} · ${NAMES[variant]}`
  }

  function setState(next) {
    state = next
    hudState.textContent = next
  }

  function setVariant(next) {
    variant = normalizeVariant(next)
    writeVariant(variant)
    updatePrototypeLabels()
    samples.forEach(sample => {
      sample.x = pointer.x
      sample.y = pointer.y
    })
  }

  function cycleVariant(direction) {
    const current = VARIANTS.indexOf(variant)
    const next = (current + direction + VARIANTS.length) % VARIANTS.length
    setVariant(VARIANTS[next])
  }

  function getTubeMetrics() {
    const rect = tube.getBoundingClientRect()
    const scaleX = rect.width > 0 ? tube.clientWidth / rect.width : 1
    const scaleY = rect.height > 0 ? tube.clientHeight / rect.height : 1
    return { rect, scaleX, scaleY }
  }

  function isFullyInside(rect) {
    return pointer.x >= rect.left + SAFE_MARGIN
      && pointer.x <= rect.right - SAFE_MARGIN
      && pointer.y >= rect.top + SAFE_MARGIN
      && pointer.y <= rect.bottom - SAFE_MARGIN
  }

  function toTubeSpace(metrics, x, y) {
    return {
      x: (x - metrics.rect.left) * metrics.scaleX,
      y: (y - metrics.rect.top) * metrics.scaleY,
    }
  }

  function setNativeCursorHidden(hidden) {
    root.classList.toggle('crt-cursor-native-hidden', hidden)
  }

  function triggerCapture(metrics, mode) {
    const local = toTubeSpace(metrics, pointer.x, pointer.y)
    capture.style.setProperty('--capture-x', `${local.x}px`)
    capture.style.setProperty('--capture-y', `${local.y}px`)
    capture.dataset.mode = mode
    capture.classList.remove('is-active')
    void capture.offsetWidth
    capture.classList.add('is-active')
    clearTimeout(captureTimer)
    captureTimer = window.setTimeout(() => capture.classList.remove('is-active'), 260)
  }

  function enterTube(metrics) {
    if (state === 'INSIDE' || state === 'CAPTURING') return

    const token = ++transitionToken
    setState('CAPTURING')
    setNativeCursorHidden(true)
    inside.classList.remove('is-releasing')
    inside.classList.add('is-visible', 'is-capturing')
    triggerCapture(metrics, 'enter')

    window.setTimeout(() => {
      if (token !== transitionToken || !isFullyInside(getTubeMetrics().rect)) return
      inside.classList.remove('is-capturing')
      setState('INSIDE')
    }, TRANSITION_MS[variant])
  }

  function leaveTube(metrics) {
    if (state === 'OUTSIDE' || state === 'RELEASING') return

    const token = ++transitionToken
    setState('RELEASING')
    inside.classList.remove('is-capturing')
    inside.classList.add('is-visible', 'is-releasing')
    triggerCapture(metrics, 'leave')

    // Restore the native cursor immediately at the threshold so the chassis
    // always feels like a normal desktop surface.
    setNativeCursorHidden(false)

    window.setTimeout(() => {
      if (token !== transitionToken) return
      if (isFullyInside(getTubeMetrics().rect)) return
      inside.classList.remove('is-visible', 'is-releasing')
      setState('OUTSIDE')
    }, TRANSITION_MS[variant])
  }

  function updateTrail(metrics, dt) {
    const head = samples[0]
    const headFollow = 1 - Math.exp(-dt * 34)
    head.x += (pointer.x - head.x) * headFollow
    head.y += (pointer.y - head.y) * headFollow

    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1]
      const sample = samples[index]
      const lag = 1 - Math.exp(-dt * (18 - index * 2.2))
      sample.x += (previous.x - sample.x) * lag
      sample.y += (previous.y - sample.y) * lag
    }

    const trailStrength = state === 'INSIDE' && variant === 'C'
      ? Math.min(.34, pointer.speed * .34)
      : 0

    insideTrail.forEach((node, index) => {
      const sample = samples[index + 1]
      const local = toTubeSpace(metrics, sample.x, sample.y)
      node.style.setProperty('--trail-x', `${local.x}px`)
      node.style.setProperty('--trail-y', `${local.y}px`)
      node.style.opacity = String(trailStrength * (1 - index / (TRAIL_COUNT + 1)))
    })
  }

  function render(now) {
    const dt = Math.min(.05, Math.max(.001, (now - lastFrame) / 1000))
    lastFrame = now

    const dx = pointer.x - pointer.previousX
    const dy = pointer.y - pointer.previousY
    const distance = Math.hypot(dx, dy)
    const instantSpeed = Math.min(1, distance / 24)
    pointer.speed += (instantSpeed - pointer.speed) * (1 - Math.exp(-dt * 18))
    pointer.previousX = pointer.x
    pointer.previousY = pointer.y

    const metrics = getTubeMetrics()
    const fullyInside = pointer.active && isFullyInside(metrics.rect)

    if (fullyInside) enterTube(metrics)
    else leaveTube(metrics)

    const local = toTubeSpace(metrics, pointer.x, pointer.y)
    inside.style.setProperty('--cursor-x', `${local.x}px`)
    inside.style.setProperty('--cursor-y', `${local.y}px`)
    inside.style.setProperty('--cursor-speed', pointer.speed.toFixed(3))
    capture.style.setProperty('--cursor-speed', pointer.speed.toFixed(3))

    updateTrail(metrics, dt)
    hudSpeed.textContent = pointer.speed.toFixed(2)
    requestAnimationFrame(render)
  }

  function onPointerMove(event) {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.active = true
  }

  function onPointerLeave() {
    pointer.active = false
    setNativeCursorHidden(false)
  }

  function onPointerEnter(event) {
    pointer.active = true
    pointer.x = event.clientX
    pointer.y = event.clientY
  }

  switcher.querySelector('[data-proto-prev]').addEventListener('click', () => cycleVariant(-1))
  switcher.querySelector('[data-proto-next]').addEventListener('click', () => cycleVariant(1))

  addEventListener('keydown', event => {
    const active = document.activeElement
    if (active?.matches?.('input, textarea, [contenteditable="true"]')) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      cycleVariant(-1)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      cycleVariant(1)
    }
  })

  addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('mouseleave', onPointerLeave)
  document.documentElement.addEventListener('mouseenter', onPointerEnter)

  updatePrototypeLabels()
  requestAnimationFrame(render)
}

installPrototype()
