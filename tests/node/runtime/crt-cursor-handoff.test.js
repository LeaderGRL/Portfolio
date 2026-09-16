import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CrtCursorController,
  absorptionDurationMs,
  easeMagneticProgress,
  outputUvFromClient,
} from '../../../src/crt-cursor-controller.js'
import { CRT_CURSOR_STATE } from '../../../src/crt-cursor-state.js'

function classList() {
  const values = new Set()
  return {
    toggle(name, enabled) { enabled ? values.add(name) : values.delete(name) },
    contains(name) { return values.has(name) },
  }
}

function harness() {
  const rootClasses = classList()
  const bodyClasses = classList()
  const tube = {
    offsetWidth: 200,
    offsetHeight: 120,
    dataset: {},
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 120 }),
  }
  const documentRef = {
    documentElement: { classList: rootClasses },
    body: { classList: bodyClasses },
    getElementById: id => id === 'tube' ? tube : null,
  }
  const listeners = new Map()
  const windowRef = {
    addEventListener(type, handler) { listeners.set(type, handler) },
    removeEventListener(type) { listeners.delete(type) },
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
    setCursorState(value) { this.state = { ...this.state, ...value }; return this.state },
  }
  const app = { state: { powerTarget: 1, fullscreen: false }, crt, dirty: false }
  const controller = new CrtCursorController(app, {
    documentRef,
    windowRef,
    view,
    finePointerQuery: { matches: true },
    reducedMotionQuery: { matches: false },
    now: () => 0,
  })
  controller.install()
  const move = (x, y, timeStamp) => controller.handlePointerMove({ clientX: x, clientY: y, timeStamp, pointerType: 'mouse' })
  return { controller, app, crt, view, tube, rootClasses, move }
}

test('absorption timing is bounded and magnetic strength is nonlinear', () => {
  assert.equal(absorptionDurationMs(0), 240)
  assert.ok(absorptionDurationMs(0.8) < 240)
  assert.ok(absorptionDurationMs(0.8) > 180)
  assert.equal(absorptionDurationMs(100), 180)
  assert.equal(easeMagneticProgress(0.5), 0.25)
})

test('output UV keeps the real client hotspot and converts top-down DOM Y to WebGL Y', () => {
  assert.deepEqual(
    outputUvFromClient({ left: 100, top: 50, width: 200, height: 100 }, 150, 75),
    { x: 0.25, y: 0.75 },
  )
})

test('Magnetic Zone capture starts as SVG at the exact hotspot and snaps atomically to GPU', () => {
  const { controller, app, crt, view, rootClasses, move } = harness()
  move(330, 160, 0)
  assert.equal(controller.state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
  assert.equal(rootClasses.contains('crt-cursor-owned'), false)

  move(300, 160, 20)
  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.equal(rootClasses.contains('crt-cursor-owned'), true)
  assert.equal(view.visible, true)
  assert.equal(view.last.x, 300)
  assert.equal(view.last.y, 160)
  assert.equal(view.last.phosphor, 0)

  move(280, 160, 40)
  controller.frame(270)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(view.visible, false)
  assert.equal(crt.state.visible, true)
  assert.equal(rootClasses.contains('crt-cursor-owned'), true)
  assert.equal(app.dirty, false)
})

test('reversal before Snap unwinds to native ownership without a GPU handoff', () => {
  const { controller, crt, view, rootClasses, move } = harness()
  move(330, 160, 0)
  move(300, 160, 20)
  controller.frame(70)
  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.ok(view.last.phosphor > 0)

  move(315, 160, 90)
  controller.frame(120)
  assert.equal(controller.state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
  assert.equal(view.visible, false)
  assert.equal(crt.state.visible, false)
  assert.equal(rootClasses.contains('crt-cursor-owned'), false)
})

test('hysteresis prevents edge flicker and Release restores native ownership at the live hotspot', () => {
  const { controller, crt, view, rootClasses, move } = harness()
  move(330, 160, 0)
  move(300, 160, 20)
  move(306, 160, 35)
  controller.frame(70)
  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.equal(rootClasses.contains('crt-cursor-owned'), true)

  move(280, 160, 50)
  controller.frame(280)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)

  move(315, 160, 300)
  controller.frame(300)
  assert.equal(controller.state, CRT_CURSOR_STATE.RELEASING)
  assert.equal(crt.state.visible, false)
  assert.equal(view.visible, true)
  assert.equal(view.last.x, 315)
  assert.equal(view.last.y, 160)

  controller.frame(430)
  assert.equal(controller.state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
  assert.equal(rootClasses.contains('crt-cursor-owned'), false)
  assert.equal(view.visible, false)
  assert.equal(crt.state.visible, false)
})

test('Release is reversible before native restoration', () => {
  const { controller, crt, view, move } = harness()
  move(330, 160, 0)
  move(300, 160, 20)
  move(280, 160, 40)
  controller.frame(270)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)

  move(315, 160, 300)
  controller.frame(300)
  assert.equal(controller.state, CRT_CURSOR_STATE.RELEASING)

  move(295, 160, 330)
  controller.frame(340)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(view.visible, false)
  assert.equal(crt.state.visible, true)
})
