import assert from 'node:assert/strict'
import test from 'node:test'
import { CrtCursorController } from '../../../src/crt-cursor-controller.js'
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
  const tubeClasses = classList()
  const reducedMotionQuery = { matches: false }
  let rect = { left: 100, top: 100, width: 200, height: 120 }

  const tube = {
    offsetWidth: 200,
    offsetHeight: 120,
    dataset: {},
    classList: tubeClasses,
    getBoundingClientRect: () => ({ ...rect }),
  }
  const documentRef = {
    documentElement: { classList: rootClasses },
    body: { classList: bodyClasses },
    getElementById: id => id === 'tube' ? tube : null,
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
  const controller = new CrtCursorController(app, {
    documentRef,
    windowRef,
    view,
    finePointerQuery: { matches: true },
    reducedMotionQuery,
    now: () => 0,
  })
  controller.install()

  return {
    controller,
    crt,
    view,
    rootClasses,
    reducedMotionQuery,
    move(x, y, timeStamp) {
      controller.handlePointerMove({ clientX: x, clientY: y, timeStamp, pointerType: 'mouse' })
    },
    setRect(nextRect) {
      rect = { ...rect, ...nextRect }
    },
  }
}

test('stationary pointer starts absorption when the live aperture moves into its Magnetic Zone', () => {
  const { controller, rootClasses, view, move, setRect } = harness()

  move(330, 160, 0)
  assert.equal(controller.state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
  assert.equal(rootClasses.contains('crt-cursor-owned'), false)

  // Simulate a chassis tilt/layout shift moving the rendered tube under the
  // already-sampled browser hotspot without emitting another pointermove.
  setRect({ left: 130 })
  controller.frame(16)

  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.equal(rootClasses.contains('crt-cursor-owned'), true)
  assert.equal(view.visible, true)
  assert.equal(view.last.x, 330)
  assert.equal(view.last.y, 160)
})

test('enabling reduced motion during Absorption collapses directly to active ownership', () => {
  const { controller, crt, view, rootClasses, reducedMotionQuery, move } = harness()

  move(330, 160, 0)
  move(300, 160, 20)
  move(280, 160, 35)
  controller.frame(70)
  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.ok(controller.absorption.progress > 0)

  reducedMotionQuery.matches = true
  controller.frame(80)

  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(controller.absorption, null)
  assert.equal(controller.recompose, null)
  assert.equal(rootClasses.contains('crt-cursor-owned'), true)
  assert.equal(view.visible, false)
  assert.equal(crt.state.visible, true)
})

test('enabling reduced motion during Release completes directly to native ownership', () => {
  const { controller, crt, view, rootClasses, reducedMotionQuery, move } = harness()

  move(330, 160, 0)
  move(300, 160, 20)
  move(280, 160, 40)
  controller.frame(270)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)

  move(315, 160, 300)
  controller.frame(300)
  assert.equal(controller.state, CRT_CURSOR_STATE.RELEASING)
  assert.equal(rootClasses.contains('crt-cursor-owned'), true)

  reducedMotionQuery.matches = true
  controller.frame(310)

  assert.equal(controller.state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
  assert.equal(controller.release, null)
  assert.equal(rootClasses.contains('crt-cursor-owned'), false)
  assert.equal(view.visible, false)
  assert.equal(crt.state.visible, false)
})
