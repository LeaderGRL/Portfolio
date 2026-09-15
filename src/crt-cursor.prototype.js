/*
 * PROTOTYPE ONLY — throwaway UI exploration.
 *
 * Question: which desktop cursor language and CRT capture transition should
 * become the production shader-backed cursor?
 *
 * Three variants live on the real portfolio route and are switchable through
 * ?variant=A, ?variant=B or ?variant=C plus the floating prototype switcher.
 * This prototype deliberately simulates the in-tube cursor with DOM placed
 * below the real glass maps. Production code must render the captured cursor
 * through the CRT persistence/composite pipeline instead.
 */

import './crt-cursor.prototype.css'

const VARIANTS = ['A', 'B', 'C']
const NAMES = {
  A: 'Electron Probe',
  B: 'Beam Needle',
  C: 'Phosphor Reticle',
}
const SAFE_RADIUS = { A: 18, B: 22, C: 28 }
const TRANSITION_MS = { A: 150, B: 155, C: 175 }
const TRAIL_COUNT = 5

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

function createCursorElement(className) {
  const element = document.createElement('div')
  element.className = className
  const glyph = document.createElement('span')
  glyph.className = 'crt-cursor-prototype__glyph'
  element.append(glyph)
  return element
}

function createTrailNode(parent, index, inside = false) {
  const node = document.createElement('i')
  node.className = 'crt-cursor-prototype__trail-node'
  node.dataset.trailIndex = String(index)
  node.style.setProperty('--trail-size', `${Math.max(2, 5 - index * .55)}px`)
  node.style.setProperty('--trail-opacity', String(Math.max(.04, .30 - index * .045)))
  node.style.setProperty('--trail-scale', String(Math.max(.42, 1 - index * .1)))
  if (inside) node.dataset.inside = 'true'
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

  const outside = createCursorElement('crt-cursor-prototype__outside')
  const inside = createCursorElement('crt-cursor-prototype__inside')
  const captureRing = document.createElement('div')
  captureRing.className = 'crt-cursor-prototype__capture-ring'

  document.body.append(outside, captureRing)
  tube.insertBefore(inside, glass)

  const outsideTrail = Array.from({ length: TRAIL_COUNT }, (_, index) =>
    createTrailNode(document.body, index, false),
  )
  const insideTrail = Array.from({ length: TRAIL_COUNT }, (_, index) =>
    createTrailNode(tube, index, true),
  )

  const hud = document.createElement('aside')
  hud.className = 'crt-cursor-prototype__hud'
  hud.innerHTML = `
    <strong>CRT CURSOR — THROWAWAY PROTOTYPE</strong><br>
    Visual simulation only. The production cursor will be shader-backed.
    <div class="crt-cursor-prototype__hud-status">
      <span>VARIANT</span><b data-proto-variant></b>
      <span>STATE</span><b data-proto-state>OUTSIDE</b>
      <span>SPEED</span><b data-proto-speed>0.00</b>
      <span>TARGET</span><b data-proto-target>CHASSIS</b>
    </div>`
  document.body.append(hud)

  const switcher = document.createElement('nav')
  switcher.className = 'crt-cursor-prototype__switcher'
  switcher.setAttribute('aria-label', 'Cursor prototype variants')
  switcher.innerHTML = `
    <button type="button" data-proto-prev aria-label="Previous cursor variant">←</button>
    <span data-proto-label></span>
    <button type="button" data-proto-next aria-label="Next cursor variant">→</button>`
  document.body.append(switcher)

  const hudVariant = hud.querySelector('[data-proto-variant]')
  const hudState = hud.querySelector('[data-proto-state]')
  const hudSpeed = hud.querySelector('[data-proto-speed]')
  const hudTarget = hud.querySelector('[data-proto-target]')
  const switcherLabel = switcher.querySelector('[data-proto-label]')

  const pointer = {
    x: innerWidth * .5,
    y: innerHeight * .5,
    previousX: innerWidth * .5,
    previousY: innerHeight * .5,
    angle: 0,
    speed: 0,
    active: false,
  }

  const history = Array.from({ length: TRAIL_COUNT + 1 }, () => ({
    x: pointer.x,
    y: pointer.y,
  }))

  let state = 'OUTSIDE'
  let transitionToken = 0
  let captureClassTimer = 0
  let pressed = false
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
    history.forEach(sample => {
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
    const radius = SAFE_RADIUS[variant]
    return pointer.x >= rect.left + radius
      && pointer.x <= rect.right - radius
      && pointer.y >= rect.top + radius
      && pointer.y <= rect.bottom - radius
  }

  function toTubeSpace(metrics, x, y) {
    return {
      x: (x - metrics.rect.left) * metrics.scaleX,
      y: (y - metrics.rect.top) * metrics.scaleY,
    }
  }

  function triggerTubeFlash(metrics) {
    const local = toTubeSpace(metrics, pointer.x, pointer.y)
    const px = tube.clientWidth > 0 ? (local.x / tube.clientWidth) * 100 : 50
    const py = tube.clientHeight > 0 ? (local.y / tube.clientHeight) * 100 : 50
    tube.style.setProperty('--capture-x', `${px}%`)
    tube.style.setProperty('--capture-y', `${py}%`)
    tube.classList.remove('crt-cursor-prototype--capture')
    void tube.offsetWidth
    tube.classList.add('crt-cursor-prototype--capture')
    clearTimeout(captureClassTimer)
    captureClassTimer = window.setTimeout(() => {
      tube.classList.remove('crt-cursor-prototype--capture')
    }, 230)
  }

  function triggerCaptureRing() {
    captureRing.style.setProperty('--ring-x', `${pointer.x}px`)
    captureRing.style.setProperty('--ring-y', `${pointer.y}px`)
    captureRing.classList.remove('is-active')
    void captureRing.offsetWidth
    captureRing.classList.add('is-active')
  }

  function enterTube(metrics) {
    if (state === 'INSIDE' || state === 'CAPTURING') return
    const token = ++transitionToken
    setState('CAPTURING')
    outside.classList.add('is-capturing')
    inside.classList.add('is-visible', 'is-capturing')
    inside.classList.remove('is-releasing')
    triggerTubeFlash(metrics)
    triggerCaptureRing()

    window.setTimeout(() => {
      if (token !== transitionToken || !isFullyInside(getTubeMetrics().rect)) return
      outside.classList.add('is-hidden')
      outside.classList.remove('is-capturing')
      inside.classList.remove('is-capturing')
      setState('INSIDE')
    }, TRANSITION_MS[variant])
  }

  function leaveTube() {
    if (state === 'OUTSIDE' || state === 'RELEASING') return
    const token = ++transitionToken
    setState('RELEASING')
    outside.classList.remove('is-hidden', 'is-capturing')
    inside.classList.remove('is-capturing')
    inside.classList.add('is-releasing', 'is-visible')
    triggerCaptureRing()

    window.setTimeout(() => {
      if (token !== transitionToken) return
      if (isFullyInside(getTubeMetrics().rect)) return
      inside.classList.remove('is-visible', 'is-releasing')
      setState('OUTSIDE')
    }, TRANSITION_MS[variant])
  }

  function updateInteractionTarget() {
    const target = document.elementFromPoint(pointer.x, pointer.y)
    const interactive = target?.closest?.('button, a, [role="button"], [role="switch"], [role="slider"], [data-action]')
    outside.classList.toggle('is-interactive', Boolean(interactive))
    hudTarget.textContent = interactive
      ? (interactive.getAttribute('aria-label') || interactive.textContent || interactive.tagName).trim().slice(0, 28)
      : (state === 'INSIDE' || state === 'CAPTURING' ? 'CRT SIGNAL' : 'CHASSIS')
  }

  function updateTrail(metrics, dt) {
    const head = history[0]
    const follow = 1 - Math.exp(-dt * (variant === 'B' ? 20 : variant === 'C' ? 13 : 17))
    head.x += (pointer.x - head.x) * follow
    head.y += (pointer.y - head.y) * follow

    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1]
      const sample = history[index]
      const lag = 1 - Math.exp(-dt * (12 - index * .85))
      sample.x += (previous.x - sample.x) * lag
      sample.y += (previous.y - sample.y) * lag
    }

    const insideActive = state !== 'OUTSIDE'
    outsideTrail.forEach((node, index) => {
      const sample = history[index + 1]
      node.style.setProperty('--trail-x', `${sample.x}px`)
      node.style.setProperty('--trail-y', `${sample.y}px`)
      node.style.opacity = insideActive ? '0' : String(Math.max(.04, .28 - index * .045) * pointer.speed)
    })

    insideTrail.forEach((node, index) => {
      const sample = history[index + 1]
      const local = toTubeSpace(metrics, sample.x, sample.y)
      node.style.setProperty('--trail-x', `${local.x}px`)
      node.style.setProperty('--trail-y', `${local.y}px`)
      node.style.opacity = insideActive ? String(Math.max(.06, .38 - index * .055) * Math.max(.3, pointer.speed)) : '0'
    })
  }

  function render(now) {
    const dt = Math.min(.05, Math.max(.001, (now - lastFrame) / 1000))
    lastFrame = now

    const dx = pointer.x - pointer.previousX
    const dy = pointer.y - pointer.previousY
    const distance = Math.hypot(dx, dy)
    if (distance > .01) pointer.angle = Math.atan2(dy, dx) * 180 / Math.PI
    const instantSpeed = Math.min(1, distance / 28)
    pointer.speed += (instantSpeed - pointer.speed) * (1 - Math.exp(-dt * 16))
    pointer.previousX = pointer.x
    pointer.previousY = pointer.y

    const metrics = getTubeMetrics()
    const fullyInside = pointer.active && isFullyInside(metrics.rect)

    if (fullyInside) enterTube(metrics)
    else leaveTube()

    outside.style.setProperty('--cursor-x', `${pointer.x}px`)
    outside.style.setProperty('--cursor-y', `${pointer.y}px`)
    outside.style.setProperty('--cursor-angle', `${pointer.angle}deg`)
    outside.style.setProperty('--cursor-speed', pointer.speed.toFixed(3))

    const local = toTubeSpace(metrics, pointer.x, pointer.y)
    inside.style.setProperty('--cursor-x', `${local.x}px`)
    inside.style.setProperty('--cursor-y', `${local.y}px`)
    inside.style.setProperty('--cursor-angle', `${pointer.angle}deg`)
    inside.style.setProperty('--cursor-speed', pointer.speed.toFixed(3))

    updateTrail(metrics, dt)
    updateInteractionTarget()
    hudSpeed.textContent = pointer.speed.toFixed(2)

    requestAnimationFrame(render)
  }

  function onPointerMove(event) {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.active = true
    outside.style.opacity = ''
  }

  function onPointerLeave() {
    pointer.active = false
    outside.style.opacity = '0'
  }

  function onPointerEnter(event) {
    pointer.active = true
    pointer.x = event.clientX
    pointer.y = event.clientY
    outside.style.opacity = ''
  }

  function setPressed(value) {
    pressed = value
    outside.classList.toggle('is-pressed', pressed)
    inside.classList.toggle('is-pressed', pressed)
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
  addEventListener('pointerdown', () => setPressed(true), { passive: true })
  addEventListener('pointerup', () => setPressed(false), { passive: true })
  addEventListener('pointercancel', () => setPressed(false), { passive: true })
  document.documentElement.addEventListener('mouseleave', onPointerLeave)
  document.documentElement.addEventListener('mouseenter', onPointerEnter)

  updatePrototypeLabels()
  requestAnimationFrame(render)
}

installPrototype()
