import assert from 'node:assert/strict'
import test from 'node:test'
import { Foley, foley } from '../../../src/audio.js'
import { CHAR_H, PAD_Y, SRC_H } from '../../../src/core.js'
import { CRT_CURSOR_SHAPE } from '../../../src/crt-cursor-shape.js'
import { installCrtCursorInteraction } from '../../../src/crt-cursor-interaction.js'
import { screenListingIndexAt } from '../../../src/runtime-controls.js'

function classList(...initial) {
  const values = new Set(initial)
  return {
    contains: name => values.has(name),
    toggle(name, enabled) { enabled ? values.add(name) : values.delete(name) },
  }
}

function actionable() {
  const node = {
    tagName: 'BUTTON',
    disabled: false,
    getAttribute: () => null,
  }
  node.closest = () => node
  return node
}

function harness({ state = 'CRT_ACTIVE', target = actionable(), reducedMotion = false } = {}) {
  const windowListeners = new Map()
  const documentListeners = new Map()
  const tube = {
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 360 }),
  }
  const machine = { classList: classList() }
  let pointTarget = target

  globalThis.addEventListener = (type, handler) => windowListeners.set(type, handler)
  globalThis.document = {
    addEventListener: (type, handler) => documentListeners.set(type, handler),
    elementFromPoint: () => pointTarget,
    getElementById(id) {
      if (id === 'tube') return tube
      if (id === 'machine') return machine
      return null
    },
  }

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
    reactionState: {
      active: false,
      strength: 0,
      submergedStrength: 0,
      recoilStrength: 0,
    },
    setCursorState(value) {
      this.cursorState = { ...this.cursorState, ...value }
      return this.cursorState
    },
    getCursorState() { return this.cursorState },
    getReactionState() { return this.reactionState },
  }
  const app = {
    state: { route: 'home', item: null, fullscreen: false },
    crt,
    rasterClientRect: () => ({ left: 0, top: 0, width: 480, height: 360 }),
  }
  const view = {
    last: null,
    update(value) { this.last = value },
  }
  const controller = {
    state,
    tube,
    pointerType: 'mouse',
    motion: { x: 240, y: 180, angle: 0.4, timeMs: 1 },
    reducedMotionQuery: { matches: reducedMotion },
    view,
    transitionOnFrame: false,
    _placement: () => ({
      hotspotUv: { x: 0.25, y: 0.75 },
      direction: { x: 1, y: 0 },
      radiusPx: 48,
    }),
    _applyReaction(placement, sample, phase) {
      crt.reactionState = { active: true, ...placement, ...sample, phase }
    },
    frame() {
      if (this.transitionOnFrame) this.state = 'CRT_ACTIVE'
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

  installCrtCursorInteraction(app, controller)
  return {
    app,
    controller,
    crt,
    documentListeners,
    machine,
    setPointTarget(value) { pointTarget = value },
    tube,
    windowListeners,
  }
}

function pointer(type, target, overrides = {}) {
  return {
    pointerType: type,
    pointerId: type === 'mouse' ? 7 : 11,
    isPrimary: true,
    button: 0,
    clientX: 240,
    clientY: 180,
    timeStamp: 100,
    target,
    ...overrides,
  }
}

test('Interactive Lock stabilizes orientation without moving the hotspot or changing the arrow shape', () => {
  const button = actionable()
  const { controller, crt } = harness({ target: button })
  const shapeBefore = JSON.stringify(CRT_CURSOR_SHAPE.points)

  controller.frame(16)
  controller.motion.angle = 1.2
  controller.frame(66)

  assert.equal(crt.cursorState.hoverIntensity, 0.48)
  assert.ok(crt.cursorState.compression > 0)
  assert.deepEqual(crt.cursorState.hotspotUv, { x: 0.25, y: 0.75 })
  assert.ok(crt.cursorState.angle > 0.4)
  assert.ok(crt.cursorState.angle < 1.2)
  assert.equal(controller.motion.angle, 1.2)
  assert.equal(JSON.stringify(CRT_CURSOR_SHAPE.points), shapeBefore)
})

test('stationary-pointer reprobe drops Interactive Lock when content moves beneath it', () => {
  const button = actionable()
  const { controller, crt, setPointTarget } = harness({ target: button })
  controller.frame(16)
  assert.equal(crt.cursorState.hoverIntensity, 0.48)

  setPointTarget(null)
  controller.frame(32)
  assert.equal(crt.cursorState.hoverIntensity, 0)
  assert.equal(crt.cursorState.compression, 0)
})

test('activation feedback belongs only to the pointer currently owned by the cursor', () => {
  const button = actionable()
  const { controller, crt, documentListeners, tube, windowListeners } = harness({ target: button })
  const oldEnsure = foley.ensure
  const oldBlip = foley.blip
  let ensureCount = 0
  let blipCount = 0
  foley.ensure = () => { ensureCount += 1 }
  foley.blip = () => { blipCount += 1 }

  try {
    windowListeners.get('pointermove')(pointer('mouse', button))
    documentListeners.get('pointerdown')(pointer('touch', button))
    documentListeners.get('pointerup')(pointer('touch', button))
    assert.equal(tube.dataset.crtCursorActivationCount, undefined)
    assert.equal(blipCount, 0)

    documentListeners.get('pointerdown')(pointer('mouse', button))
    documentListeners.get('pointerup')(pointer('mouse', button))
    assert.equal(tube.dataset.crtCursorActivationCount, '1')
    assert.equal(ensureCount, 1)
    assert.equal(blipCount, 1)

    controller.frame(110)
    assert.ok(crt.cursorState.clickImpulse > 0)
    assert.equal(crt.reactionState.phase, 'interaction')
  } finally {
    foley.ensure = oldEnsure
    foley.blip = oldBlip
  }
})

test('empty-space pointer activation stays quiet', () => {
  const { documentListeners, setPointTarget, tube, windowListeners } = harness({ target: null })
  const oldEnsure = foley.ensure
  const oldBlip = foley.blip
  let soundCount = 0
  foley.ensure = () => { soundCount += 1 }
  foley.blip = () => { soundCount += 1 }

  try {
    setPointTarget(null)
    windowListeners.get('pointermove')(pointer('mouse', null))
    documentListeners.get('pointerdown')(pointer('mouse', null))
    documentListeners.get('pointerup')(pointer('mouse', null))
    assert.equal(tube.dataset.crtCursorActivationCount, undefined)
    assert.equal(soundCount, 0)
  } finally {
    foley.ensure = oldEnsure
    foley.blip = oldBlip
  }
})

test('successful cinematic Snap uses the shared Foley blip but reduced motion stays quiet', () => {
  const oldBlip = foley.blip
  let blipCount = 0
  foley.blip = () => { blipCount += 1 }

  try {
    const normal = harness({ state: 'ABSORBING', target: null })
    normal.controller.transitionOnFrame = true
    normal.controller.frame(200)
    assert.equal(blipCount, 1)

    const reduced = harness({ state: 'ABSORBING', target: null, reducedMotion: true })
    reduced.controller.transitionOnFrame = true
    reduced.controller.frame(200)
    assert.equal(blipCount, 1)
  } finally {
    foley.blip = oldBlip
  }
})

test('screen listing rows classify only where the existing pointer runtime makes them actionable', () => {
  const { app, machine } = harness({ target: null })
  app.state.route = 'projects'
  app.state.fullscreen = true
  const y = ((PAD_Y + (3.25 * CHAR_H)) / SRC_H) * 360
  assert.equal(screenListingIndexAt(app, 120, y), 0)

  app.state.fullscreen = false
  assert.equal(screenListingIndexAt(app, 120, y), -1)
  machine.classList.toggle('is-compact', true)
  assert.equal(screenListingIndexAt(app, 120, y), 0)

  app.state.item = { id: 'opened' }
  assert.equal(screenListingIndexAt(app, 120, y), -1)
})

test('the existing Foley volume and mute policy silences cursor blips at zero', () => {
  const audio = new Foley()
  let oscillators = 0
  const chain = () => ({ connect() { return this } })
  const gainNode = () => ({
    ...chain(),
    gain: {
      value: 0,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime() {},
    },
  })
  audio.ctx = {
    currentTime: 1,
    createOscillator() {
      oscillators += 1
      return {
        ...chain(),
        frequency: { value: 0 },
        start() {},
        stop() {},
      }
    },
    createGain: gainNode,
  }
  audio.master = gainNode()

  audio.setVolume(0)
  audio.blip()
  assert.equal(oscillators, 0)

  audio.setVolume(0.28)
  audio.blip()
  assert.equal(oscillators, 1)

  audio.enabled = false
  audio.blip()
  assert.equal(oscillators, 1)
})
