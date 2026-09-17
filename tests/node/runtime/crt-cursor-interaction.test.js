import assert from 'node:assert/strict'
import test from 'node:test'
import { Foley } from '../../../src/audio.js'
import { CHAR_H, PAD_Y, SRC_H } from '../../../src/core.js'
import { CRT_CURSOR_SHAPE } from '../../../src/crt-cursor-shape.js'
import {
  CrtCursorInteractionController,
} from '../../../src/crt-cursor-interaction.js'
import { screenListingIndexAt } from '../../../src/runtime-controls.js'

function classList(...initial) {
  const values = new Set(initial)
  return {
    contains: name => values.has(name),
    toggle(name, enabled) { enabled ? values.add(name) : values.delete(name) },
  }
}

function actionable(tagName = 'BUTTON') {
  const node = {
    tagName,
    disabled: false,
    getAttribute: () => null,
  }
  node.closest = () => node
  return node
}

function harness({ state = 'CRT_ACTIVE', target = actionable(), reducedMotion = false } = {}) {
  const listeners = new Map()
  const tube = {
    dataset: {},
    addEventListener(type, handler) { listeners.set(type, handler) },
    removeEventListener(type) { listeners.delete(type) },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 360 }),
  }
  const machine = { classList: classList() }
  let pointTarget = target
  const documentRef = {
    getElementById(id) {
      if (id === 'tube') return tube
      if (id === 'machine') return machine
      return null
    },
    elementFromPoint: () => pointTarget,
    addEventListener() {},
    removeEventListener() {},
  }
  const windowRef = { addEventListener() {}, removeEventListener() {} }
  const crt = {
    cursorState: {
      visible: true,
      hotspotUv: { x: 0.25, y: 0.75 },
      angle: 0.4,
      sizePx: 20,
      compression: 0,
      hoverIntensity: 0,
      clickImpulse: 0,
      recompositionStrength: 0,
    },
    reactionState: { active: false, strength: 0, submergedStrength: 0, recoilStrength: 0 },
    setCursorState(value) { this.cursorState = { ...this.cursorState, ...value }; return this.cursorState },
    getCursorState() { return this.cursorState },
    getReactionState() { return this.reactionState },
  }
  const app = {
    state: { route: 'home', item: null, fullscreen: false },
    crt,
    rasterClientRect: () => ({ left: 0, top: 0, width: 480, height: 360 }),
  }
  const audio = {
    ensureCount: 0,
    clickCount: 0,
    snapCount: 0,
    ensure() { this.ensureCount += 1 },
    cursorClick() { this.clickCount += 1; return true },
    cursorSnap() { this.snapCount += 1; return true },
  }
  const view = {
    last: null,
    update(value) { this.last = value },
  }
  const controller = {
    state,
    tube,
    edge: { inside: true },
    motion: { x: 240, y: 180, angle: 0.4, timeMs: 1 },
    reducedMotionQuery: { matches: reducedMotion },
    view,
    _placement: () => ({
      hotspotUv: { x: 0.25, y: 0.75 },
      direction: { x: 1, y: 0 },
      radiusPx: 48,
    }),
    _applyReaction(placement, sample, phase) {
      crt.reactionState = { active: true, ...placement, ...sample, phase }
    },
    frame() {
      crt.setCursorState({
        visible: true,
        hotspotUv: { x: 0.25, y: 0.75 },
        angle: this.motion.angle,
        sizePx: 20,
        compression: 0,
        hoverIntensity: 0,
        clickImpulse: 0,
        recompositionStrength: 0,
      })
    },
  }
  const interaction = new CrtCursorInteractionController(app, controller, {
    audio,
    documentRef,
    windowRef,
  }).install()
  return {
    app,
    audio,
    controller,
    crt,
    documentRef,
    interaction,
    machine,
    setPointTarget(value) { pointTarget = value },
    tube,
  }
}

test('actionable hover locks orientation moderately without moving the hotspot or changing the arrow shape', () => {
  const button = actionable()
  const { controller, crt, interaction, tube } = harness({ target: button })
  const shapeBefore = JSON.stringify(CRT_CURSOR_SHAPE.points)

  interaction.handlePointerMove({ target: button, clientX: 240, clientY: 180 })
  controller.motion.angle = 1.2
  controller.frame(16)
  controller.frame(66)

  assert.equal(tube.dataset.crtCursorInteractive, 'locked')
  assert.equal(tube.dataset.crtCursorInteractiveTarget, 'semantic')
  assert.ok(crt.cursorState.hoverIntensity > 0)
  assert.ok(crt.cursorState.compression > 0)
  assert.deepEqual(crt.cursorState.hotspotUv, { x: 0.25, y: 0.75 })
  assert.ok(crt.cursorState.angle > 0.4)
  assert.ok(crt.cursorState.angle < 1.2)
  assert.equal(controller.motion.angle, 1.2)
  assert.equal(JSON.stringify(CRT_CURSOR_SHAPE.points), shapeBefore)
})

test('non-actionable content never enters Interactive Lock', () => {
  const { controller, crt, interaction, tube } = harness({ target: null })
  interaction.handlePointerMove({ target: null, clientX: 240, clientY: 180 })
  controller.frame(16)
  assert.equal(tube.dataset.crtCursorInteractive, 'idle')
  assert.equal(crt.cursorState.hoverIntensity, 0)
  assert.equal(crt.cursorState.clickImpulse, 0)
})

test('semantic activation triggers one visual/audio impulse while empty space and keyboard clicks stay quiet', () => {
  const button = actionable()
  const { audio, controller, crt, interaction, setPointTarget, tube } = harness({ target: button })

  interaction.handlePointerMove({ target: button, clientX: 240, clientY: 180 })
  interaction.handleClick({ detail: 1, target: button, clientX: 240, clientY: 180, timeStamp: 100 })
  assert.equal(audio.ensureCount, 1)
  assert.equal(audio.clickCount, 1)
  assert.equal(tube.dataset.crtCursorActivationCount, undefined)

  controller.frame(110)
  assert.ok(crt.cursorState.clickImpulse > 0)
  assert.equal(crt.reactionState.phase, 'interaction')
  assert.equal(tube.dataset.crtCursorActivationCount, '1')

  setPointTarget(null)
  interaction.handlePointerMove({ target: null, clientX: 240, clientY: 180 })
  interaction.handleClick({ detail: 1, target: null, clientX: 240, clientY: 180, timeStamp: 120 })
  interaction.handleClick({ detail: 0, target: button, clientX: 240, clientY: 180, timeStamp: 130 })
  assert.equal(audio.clickCount, 1)
})

test('successful Snap gets one micro-sound and reduced motion does not synthesize it', () => {
  const normal = harness({ state: 'ABSORBING', target: null })
  normal.controller.frame = normal.interaction.frameWrapper
  normal.interaction.baseFrame = () => { normal.controller.state = 'CRT_ACTIVE' }
  normal.controller.frame(200)
  assert.equal(normal.audio.snapCount, 1)

  const reduced = harness({ state: 'ABSORBING', target: null, reducedMotion: true })
  reduced.controller.frame = reduced.interaction.frameWrapper
  reduced.interaction.baseFrame = () => { reduced.controller.state = 'CRT_ACTIVE' }
  reduced.controller.frame(200)
  assert.equal(reduced.audio.snapCount, 0)
})

test('screen listing rows classify only when they are genuine pointer targets', () => {
  const { app, documentRef, machine } = harness({ target: null })
  app.state.route = 'projects'
  app.state.fullscreen = true
  const y = ((PAD_Y + (3.25 * CHAR_H)) / SRC_H) * 360
  assert.equal(screenListingIndexAt(app, 120, y, documentRef), 0)

  app.state.fullscreen = false
  assert.equal(screenListingIndexAt(app, 120, y, documentRef), -1)
  machine.classList.toggle('is-compact', true)
  assert.equal(screenListingIndexAt(app, 120, y, documentRef), 0)

  app.state.item = { id: 'opened' }
  assert.equal(screenListingIndexAt(app, 120, y, documentRef), -1)
})

test('content changes preserve active ownership and the exact cursor hotspot', () => {
  const { app, controller, crt } = harness({ target: null })
  controller.frame(20)
  const before = { ...crt.cursorState.hotspotUv }

  app.state.route = 'projects'
  app.state.item = { id: 'astro', label: 'Astro' }
  controller.frame(70)

  assert.equal(controller.state, 'CRT_ACTIVE')
  assert.deepEqual(crt.cursorState.hotspotUv, before)
})

test('cursor tones follow the existing Foley master volume and mute policy', () => {
  const foley = new Foley()
  let oscillatorCount = 0
  let appliedMaster = null
  const chain = () => ({ connect() { return this } })
  const gainNode = () => ({
    ...chain(),
    gain: {
      value: 0,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime(value) { appliedMaster = value },
    },
  })
  foley.ctx = {
    currentTime: 1,
    createOscillator() {
      oscillatorCount += 1
      return {
        ...chain(),
        type: 'sine',
        frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        start() {},
        stop() {},
      }
    },
    createGain: gainNode,
  }
  foley.master = gainNode()

  foley.setVolume(0)
  assert.equal(appliedMaster, 0)
  assert.equal(foley.cursorClick(), false)
  assert.equal(oscillatorCount, 0)

  foley.setVolume(0.28)
  assert.equal(appliedMaster, 0.28)
  assert.equal(foley.cursorClick(), true)
  assert.equal(foley.cursorSnap(), true)
  assert.equal(oscillatorCount, 2)

  foley.enabled = false
  assert.equal(foley.cursorClick(), false)
  assert.equal(oscillatorCount, 2)
})
