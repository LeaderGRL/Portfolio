import assert from 'node:assert/strict'
import test from 'node:test'
import { createPointerSampleBuffer } from '../../../src/crt-cursor-pointer-buffer.js'
import {
  CrtCursorRuntimeController,
  installTubeQuadFallback,
} from '../../../src/crt-cursor-runtime-controller.js'
import { CRT_CURSOR_STATE } from '../../../src/crt-cursor-state.js'

function classList() {
  const values = new Set()
  return {
    toggle(name, enabled) { enabled ? values.add(name) : values.delete(name) },
    contains(name) { return values.has(name) },
  }
}

function runtimeHarness() {
  const rootClasses = classList()
  const bodyClasses = classList()
  const tubeClasses = classList()
  let rect = { left: 100, top: 100, width: 200, height: 120 }
  let hitSoftkey = false

  const softkey = {
    closest(selector) { return selector === '.softkeys__key' ? this : null },
  }
  const plainTarget = {
    closest() { return null },
  }
  const tube = {
    offsetWidth: 200,
    offsetHeight: 120,
    dataset: {},
    classList: tubeClasses,
    getBoundingClientRect: () => ({ ...rect }),
    getBoxQuads: () => [{
      p1: { x: rect.left, y: rect.top },
      p2: { x: rect.left + rect.width, y: rect.top },
      p3: { x: rect.left + rect.width, y: rect.top + rect.height },
      p4: { x: rect.left, y: rect.top + rect.height },
    }],
  }
  const documentRef = {
    documentElement: { classList: rootClasses },
    body: { classList: bodyClasses },
    getElementById: id => id === 'tube' ? tube : null,
    elementFromPoint: () => hitSoftkey ? softkey : plainTarget,
  }
  const windowRef = {
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({
      getPropertyValue: name => name === '--tube-bleed-x' ? '12px' : name === '--tube-bleed-y' ? '10px' : '',
    }),
  }
  const view = {
    visible: false,
    last: null,
    mount() {},
    show() { this.visible = true },
    hide() { this.visible = false },
    update(value) { this.last = value },
    destroy() {},
  }
  const crt = {
    ok: true,
    state: { visible: false },
    setCursorState(value) {
      this.state = { ...this.state, ...value }
      return this.state
    },
  }
  const app = {
    state: { powerTarget: 1, crtTarget: 1, fullscreen: false },
    crt,
    dirty: false,
  }
  const controller = new CrtCursorRuntimeController(app, {
    documentRef,
    windowRef,
    view,
    finePointerQuery: { matches: true },
    reducedMotionQuery: { matches: false },
    now: () => 0,
  })
  controller.install()

  return {
    app,
    controller,
    crt,
    tube,
    view,
    move(x, y, timeStamp) {
      controller.handlePointerMove({
        clientX: x,
        clientY: y,
        timeStamp,
        pointerType: 'mouse',
        target: hitSoftkey ? softkey : plainTarget,
      })
    },
    setRect(nextRect) {
      rect = { ...rect, ...nextRect }
    },
    setSoftkeyHit(value) {
      hitSoftkey = Boolean(value)
    },
  }
}

test('tube quad fallback derives transformed corners from zero-size browser probes', () => {
  const rects = [
    { left: 101, top: 51 },
    { left: 261, top: 56 },
    { left: 251, top: 131 },
    { left: 111, top: 126 },
  ]
  const probes = []
  let removed = 0
  const documentRef = {
    createElement() {
      const index = probes.length
      const probe = {
        dataset: {},
        style: {},
        setAttribute() {},
        getBoundingClientRect: () => rects[index],
        remove() { removed += 1 },
      }
      probes.push(probe)
      return probe
    },
  }
  const tube = {
    append() {},
  }

  const cleanup = installTubeQuadFallback(tube, documentRef)
  assert.equal(typeof tube.getBoxQuads, 'function')
  assert.equal(probes.length, 4)
  assert.deepEqual(tube.getBoxQuads(), [{
    p1: { x: 101, y: 51 },
    p2: { x: 261, y: 56 },
    p3: { x: 251, y: 131 },
    p4: { x: 111, y: 126 },
  }])
  assert.deepEqual(
    probes.map(probe => [probe.style.left || '', probe.style.right || '', probe.style.top || '', probe.style.bottom || '']),
    [
      ['0', '', '0', ''],
      ['', '0', '0', ''],
      ['', '0', '', '0'],
      ['0', '', '', '0'],
    ],
  )

  cleanup()
  assert.equal(Object.hasOwn(tube, 'getBoxQuads'), false)
  assert.equal(removed, 4)
})

test('tube quad fallback never replaces a native getBoxQuads implementation', () => {
  const native = () => [{ p1: { x: 1, y: 2 } }]
  let createCalls = 0
  const tube = {
    getBoxQuads: native,
    append() {},
  }
  const cleanup = installTubeQuadFallback(tube, {
    createElement() {
      createCalls += 1
      return {}
    },
  })

  assert.equal(tube.getBoxQuads, native)
  assert.equal(createCalls, 0)
  cleanup()
  assert.equal(tube.getBoxQuads, native)
})

test('stationary fullscreen capture recomputes softkey overlay ownership without pointer movement', () => {
  const { app, controller, crt, tube, view, move, setRect, setSoftkeyHit } = runtimeHarness()

  move(330, 160, 0)
  assert.equal(controller.state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
  assert.equal(controller.softkeyOverlayActive, false)

  app.state.fullscreen = true
  setRect({ left: 140 })
  setSoftkeyHit(true)

  controller.frame(16)
  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.equal(controller.softkeyOverlayActive, true)

  controller.frame(300)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(tube.dataset.crtCursorOwner, 'svg-overlay')
  assert.equal(view.visible, true)
  assert.equal(crt.state.visible, false)
})

test('fullscreen exit Release preserves the treatment rendered over a softkey', () => {
  const { app, controller, tube, view, move, setRect, setSoftkeyHit } = runtimeHarness()

  move(280, 160, 0)
  controller.frame(260)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)

  app.state.fullscreen = true
  setSoftkeyHit(true)
  move(280, 160, 280)
  controller.frame(280)
  assert.equal(tube.dataset.crtCursorOwner, 'svg-overlay')
  assert.equal(view.last.phosphor, 0.72)

  app.state.fullscreen = false
  setSoftkeyHit(false)
  setRect({ left: 20 })
  controller.frame(300)

  assert.equal(controller.state, CRT_CURSOR_STATE.RELEASING)
  assert.ok(view.last.phosphor <= 0.72)
  assert.ok(view.last.phosphor > 0.71)
})

test('CRT bypass Release starts from the displayed reduced treatment instead of flashing full phosphor', () => {
  const { app, controller, view, move } = runtimeHarness()

  move(280, 160, 0)
  controller.frame(260)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)

  app.state.crtTarget = 0
  controller.frame(280)
  assert.equal(view.visible, true)
  assert.equal(view.last.phosphor, 0.58)

  move(320, 160, 300)
  controller.frame(300)
  assert.equal(controller.state, CRT_CURSOR_STATE.RELEASING)
  assert.ok(view.last.phosphor <= 0.58)
  assert.ok(view.last.phosphor > 0.57)

  controller.frame(360)
  assert.ok(view.last.phosphor < 0.58)
})

test('active ownership uses an above-bezel DOM cursor outside the visible aperture', () => {
  const { controller, crt, tube, view, move } = runtimeHarness()

  move(280, 160, 0)
  controller.frame(260)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(crt.state.visible, true)

  // The authored aperture ends at x=288 after the 12 px horizontal bleed.
  // Seven pixels outside the glass is still inside the ownership hysteresis.
  move(295, 160, 300)
  controller.frame(300)

  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(tube.dataset.crtCursorOwner, 'svg-edge')
  assert.equal(view.visible, true)
  assert.equal(view.last.phosphor, 1)
  assert.equal(crt.state.visible, false)

  move(285, 160, 320)
  controller.frame(320)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(tube.dataset.crtCursorOwner, 'gpu')
  assert.equal(view.visible, false)
  assert.equal(crt.state.visible, true)
})

test('pointer sample buffer preserves the latest observable pointer while rebasing its animation clock', () => {
  const listeners = new Map()
  const windowRef = {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
  }
  const target = { id: 'tube' }
  const buffer = createPointerSampleBuffer(windowRef).start()

  listeners.get('pointermove')?.({
    clientX: 210,
    clientY: 145,
    timeStamp: 12,
    pointerType: 'mouse',
    target,
  })
  listeners.get('pointerover')?.({
    clientX: 222,
    clientY: 151,
    timeStamp: 18,
    pointerType: 'mouse',
    target,
  })

  assert.deepEqual(buffer.peek(), {
    clientX: 222,
    clientY: 151,
    timeStamp: 18,
    pointerType: 'mouse',
    target,
  })

  const sample = buffer.stop().consume(500)
  assert.deepEqual(sample, {
    clientX: 222,
    clientY: 151,
    timeStamp: 500,
    pointerType: 'mouse',
    target,
  })
  assert.equal(listeners.size, 0)
  assert.equal(buffer.consume(), null)
})

test('rebased buffered pointer sample starts a fresh Absorption clock', () => {
  const listeners = new Map()
  const windowRef = {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
  }
  const buffer = createPointerSampleBuffer(windowRef).start()
  listeners.get('pointermove')?.({
    clientX: 285,
    clientY: 160,
    timeStamp: 18,
    pointerType: 'mouse',
    target: null,
  })
  const sample = buffer.stop().consume(500)
  const { controller } = runtimeHarness()

  controller.handlePointerMove(sample)
  controller.frame(516)

  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.ok(controller.absorption.progress > 0)
  assert.ok(controller.absorption.progress < 0.2)
})
