import assert from 'node:assert/strict'
import test from 'node:test'

globalThis.matchMedia = () => ({ matches: false })

const {
  DEFAULT_CRT_GLASS_REACTION_STATE,
  GLASS_RECOIL_DURATION_MS,
  glassRecoilSample,
  normalizeCrtGlassReactionState,
  releaseReactionSample,
} = await import('../../../src/crt-cursor-reaction.js')
const {
  CRT,
  FRAG_CRT,
  FRAG_CRT_BASE,
  FRAG_CRT_CURSOR,
  FRAG_PERSIST,
} = await import('../../../src/crt.js')
const {
  CrtCursorGlassController,
  gpuReactionPlacementFromClient,
} = await import('../../../src/crt-cursor-glass-controller.js')
const { createTubeProjection } = await import('../../../src/crt-cursor-controller.js')
const { CRT_CURSOR_STATE } = await import('../../../src/crt-cursor-state.js')

const renderState = {
  crt: 1,
  power: 1,
  time: 1,
  warm: 1,
  static: 0,
  degauss: 0,
}

function createFakeGl() {
  const uniforms = {}
  const uploads = { source: 0, cursor: 0, target: 0 }
  const programUses = []
  let textureId = 0
  let programId = 0

  const gl = new Proxy({
    NO_ERROR: 0,
    getParameter: key => key === 'MAX_VIEWPORT_DIMS' ? [4096, 4096] : 4096,
    checkFramebufferStatus: () => 'FRAMEBUFFER_COMPLETE',
    getError: () => 0,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getUniformLocation: (_program, name) => name,
    createProgram: () => ({ id: ++programId }),
    useProgram: program => { programUses.push(program?.id ?? null) },
    createTexture: () => ({ id: ++textureId }),
    texImage2D: (...args) => {
      if (args.length === 6) uploads.source += 1
      else if (args.length === 9 && args[8] instanceof Uint8Array) uploads.cursor += 1
      else if (args.length === 9 && args[8] === null) uploads.target += 1
    },
    uniform1f: (name, value) => { uniforms[name] = value },
    uniform2f: (name, x, y) => { uniforms[name] = [x, y] },
    uniform1i: (name, value) => { uniforms[name] = value },
  }, {
    get: (target, key) => key in target
      ? target[key]
      : /^[A-Z0-9_]+$/.test(key)
        ? key
        : () => ({}),
  })

  return { gl, uniforms, uploads, programUses }
}

function classList() {
  const values = new Set()
  return {
    toggle(name, enabled) { enabled ? values.add(name) : values.delete(name) },
    contains(name) { return values.has(name) },
  }
}

function controllerHarness() {
  const tube = {
    offsetWidth: 200,
    offsetHeight: 120,
    dataset: {},
    classList: classList(),
    getBoxQuads: () => [],
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 120 }),
  }
  const documentRef = {
    documentElement: { classList: classList() },
    body: { classList: classList() },
    getElementById: id => id === 'tube' ? tube : null,
    elementFromPoint: () => null,
  }
  const windowRef = {
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({
      getPropertyValue: name => name === '--tube-bleed-x' ? '12px' : name === '--tube-bleed-y' ? '10px' : '',
    }),
  }
  const view = {
    mount() {}, show() {}, hide() {}, update() {}, destroy() {},
  }
  const crt = {
    ok: true,
    cursorState: { visible: false },
    reactionState: DEFAULT_CRT_GLASS_REACTION_STATE,
    setCursorState(value) { this.cursorState = { ...this.cursorState, ...value }; return this.cursorState },
    setReactionState(value) {
      this.reactionState = normalizeCrtGlassReactionState(value, this.reactionState)
      return this.reactionState
    },
  }
  const app = {
    state: { powerTarget: 1, crtTarget: 1, fullscreen: false },
    crt,
    dirty: false,
  }
  const controller = new CrtCursorGlassController(app, {
    documentRef,
    windowRef,
    view,
    finePointerQuery: { matches: true },
    reducedMotionQuery: { matches: false },
    now: () => 0,
  })
  controller.install()
  const move = (x, y, timeStamp) => controller.handlePointerMove({
    clientX: x,
    clientY: y,
    timeStamp,
    pointerType: 'mouse',
    target: null,
  })
  return { controller, app, crt, tube, move }
}

const directionalDisplacementPx = sample => sample.strength * 1.85 + sample.recoilStrength * 1.10

test('reaction state stays bounded and recoil damps through a small visible overshoot', () => {
  const normalized = normalizeCrtGlassReactionState({
    active: true,
    hotspotUv: { x: 0.2, y: 0.8 },
    direction: { x: 10, y: 0 },
    strength: 2,
    submergedStrength: -1,
    recoilStrength: -2,
    radiusPx: 500,
  })
  assert.equal(normalized.active, true)
  assert.deepEqual(normalized.hotspotUv, { x: 0.2, y: 0.8 })
  assert.deepEqual(normalized.direction, { x: 1, y: 0 })
  assert.equal(normalized.strength, 1)
  assert.equal(normalized.submergedStrength, 0)
  assert.equal(normalized.recoilStrength, -1)
  assert.equal(normalized.radiusPx, 96)

  const start = glassRecoilSample(0)
  const overshoot = glassRecoilSample(80)
  const end = glassRecoilSample(GLASS_RECOIL_DURATION_MS)
  assert.equal(start.strength, 1)
  assert.ok(start.recoilStrength > 0)
  assert.ok(overshoot.recoilStrength < 0)
  assert.ok(directionalDisplacementPx(overshoot) < -0.05)
  assert.ok(directionalDisplacementPx(start) < 3)
  assert.deepEqual(end, { strength: 0, submergedStrength: 0, recoilStrength: 0 })

  const release = releaseReactionSample(0)
  assert.ok(release.strength > 0)
  assert.ok(release.strength < 0.2)
  assert.equal(release.recoilStrength, 0)
  assert.equal(releaseReactionSample(1).strength, 0)
})

test('reaction shader is localized, keeps the cursor hotspot unwarped and stays outside persistence', () => {
  assert.equal(FRAG_PERSIST.includes('uReaction'), false)
  assert.ok(FRAG_CRT.includes('return exp(-q * 3.25);'))
  assert.ok(FRAG_CRT.includes('texture(uTex, reactionWarp(suv)).rgb'))
  assert.ok(FRAG_CRT.includes('return base + cursorEmission(suv);'))
  assert.ok(FRAG_CRT.includes('uReactionStrength * 1.85'))
  assert.ok(FRAG_CRT.includes('uReactionSubmerged * 0.45'))
  assert.ok(FRAG_CRT.includes('reactionVertical'))
  assert.ok(FRAG_CRT.includes('reactionVertical + uReactionDirection.y * 0.35'))

  // Cursor-only frames keep the GPU cursor but contain no reachable reaction
  // warp or scanline deformation after the recoil has settled.
  assert.ok(FRAG_CRT_CURSOR.includes('return texture(uTex, suv).rgb + cursorEmission(suv);'))
  assert.equal(FRAG_CRT_CURSOR.includes('texture(uTex, reactionWarp(suv)).rgb'), false)
  assert.equal(FRAG_CRT_CURSOR.includes('gReactionSignalHotspot = signalUv(uReactionHotspot);'), false)
  assert.equal(FRAG_CRT_CURSOR.includes('float scanBendPx = reactionMask'), false)

  // The established idle fast path contains neither cursor nor reaction work.
  assert.ok(FRAG_CRT_BASE.includes('vec3 src(vec2 suv){ return texture(uTex, suv).rgb; }'))
  assert.equal(FRAG_CRT_BASE.includes('gCursorSignalHotspot = signalUv(uCursorHotspot);'), false)
  assert.equal(FRAG_CRT_BASE.includes('gReactionSignalHotspot = signalUv(uReactionHotspot);'), false)
  assert.equal(FRAG_CRT_BASE.includes('float scanBendPx = reactionMask'), false)
})

test('reaction-only frames use uniforms without re-uploading the raster source or cursor resource', () => {
  const { gl, uniforms, uploads, programUses } = createFakeGl()
  const source = { width: 480, height: 360 }
  const canvas = { getContext: () => gl, width: 480, height: 360, offsetWidth: 480, offsetHeight: 360 }
  const crt = new CRT(canvas, source)

  assert.equal(crt.ok, true)
  assert.equal(crt.render(renderState, false), true)
  assert.equal(uploads.source, 1)
  assert.equal(uploads.cursor, 1)
  assert.equal(programUses.at(-1), crt.progCrtBase.id)

  crt.setCursorState({
    visible: true,
    hotspotUv: { x: 0.4, y: 0.6 },
  })
  assert.equal(crt.render(renderState, false), true)
  assert.equal(programUses.at(-1), crt.progCrtCursor.id)
  assert.equal(uploads.source, 1)
  assert.equal(uploads.cursor, 1)

  crt.setCursorState({ visible: false })
  crt.setReactionState({
    active: true,
    hotspotUv: { x: 0.7, y: 0.3 },
    direction: { x: -1, y: 0.25 },
    strength: 0.6,
    submergedStrength: 0.4,
    recoilStrength: -0.1,
    radiusPx: 52,
  })
  assert.equal(crt.render(renderState, false), true)
  assert.equal(programUses.at(-1), crt.progCrt.id)
  assert.equal(uploads.source, 1)
  assert.equal(uploads.cursor, 1)
  assert.equal(uniforms.uCursorVisible, 0)
  assert.deepEqual(uniforms.uReactionHotspot, [0.7, 0.3])
  assert.ok(Math.abs(uniforms.uReactionStrength - 0.6) < 1e-9)
  assert.ok(uniforms.uReactionRecoil < 0)

  crt.setReactionState({ strength: 0.25, recoilStrength: 0.08 })
  assert.equal(crt.render(renderState, false), true)
  assert.equal(uploads.source, 1)
  assert.equal(uploads.cursor, 1)

  crt.setReactionState({ active: false, strength: 0, submergedStrength: 0, recoilStrength: 0 })
  assert.equal(crt.render(renderState, false), true)
  assert.equal(programUses.at(-1), crt.progCrtBase.id)
  assert.equal(uploads.source, 1)
})

test('projected reaction placement follows the real client hotspot and inward direction', () => {
  const projection = createTubeProjection({
    rect: { left: 100, top: 50, width: 160, height: 80 },
    localWidth: 200,
    localHeight: 100,
    quad: [
      { x: 100, y: 50 },
      { x: 260, y: 55 },
      { x: 250, y: 130 },
      { x: 110, y: 125 },
    ],
  })
  const placement = gpuReactionPlacementFromClient(
    projection,
    179.6666666667,
    92.4888888889,
    { x: -1, y: 0.1 },
    56,
  )
  assert.ok(Math.abs(placement.hotspotUv.x - 0.5) < 1e-5)
  assert.ok(Math.abs(placement.hotspotUv.y - 0.5) < 1e-5)
  assert.ok(Math.abs(Math.hypot(placement.direction.x, placement.direction.y) - 1) < 1e-6)
  assert.ok(placement.radiusPx > 56)
})

test('absorption reaction follows progress, reversal clears it, and Snap produces damped recoil', () => {
  const { controller, app, crt, tube, move } = controllerHarness()
  move(330, 160, 0)
  move(300, 160, 20)
  controller.frame(70)
  assert.equal(controller.state, CRT_CURSOR_STATE.ABSORBING)
  assert.equal(crt.reactionState.active, true)
  assert.ok(crt.reactionState.strength > 0)
  assert.equal(tube.dataset.crtCursorReaction, 'absorb')
  assert.equal(app.dirty, false)

  move(315, 160, 90)
  controller.frame(120)
  assert.equal(controller.state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
  assert.equal(crt.reactionState.active, false)
  assert.equal(tube.dataset.crtCursorReaction, 'idle')

  move(300, 160, 160)
  move(280, 160, 180)
  controller.frame(410)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(tube.dataset.crtCursorReaction, 'recoil')
  assert.equal(crt.reactionState.active, true)

  controller.frame(490)
  assert.equal(tube.dataset.crtCursorReaction, 'recoil')
  assert.ok(crt.reactionState.recoilStrength < 0)
  assert.ok(directionalDisplacementPx(crt.reactionState) < -0.05)

  controller.frame(660)
  assert.equal(crt.reactionState.active, false)
  assert.equal(tube.dataset.crtCursorReaction, 'idle')
  assert.equal(app.dirty, false)
})

test('Release blends continuously from an in-flight recoil before becoming quiet', () => {
  const { controller, crt, tube, move } = controllerHarness()
  move(300, 160, 20)
  move(280, 160, 40)
  controller.frame(270)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(tube.dataset.crtCursorReaction, 'recoil')
  const before = crt.reactionState
  assert.ok(before.strength > 0.99)

  move(315, 160, 280)
  controller.frame(280)
  assert.equal(controller.state, CRT_CURSOR_STATE.RELEASING)
  assert.equal(tube.dataset.crtCursorReaction, 'release')
  assert.ok(Math.abs(crt.reactionState.strength - before.strength) < 1e-9)
  assert.ok(Math.abs(crt.reactionState.recoilStrength - before.recoilStrength) < 1e-9)
  assert.ok(Math.abs(crt.reactionState.hotspotUv.x - before.hotspotUv.x) < 1e-9)
  assert.ok(Math.abs(crt.reactionState.hotspotUv.y - before.hotspotUv.y) < 1e-9)
  assert.ok(Math.abs(crt.reactionState.direction.x - before.direction.x) < 1e-9)
  assert.ok(Math.abs(crt.reactionState.direction.y - before.direction.y) < 1e-9)
  assert.ok(Math.abs(crt.reactionState.radiusPx - before.radiusPx) < 1e-9)

  controller.frame(320)
  assert.equal(tube.dataset.crtCursorReaction, 'release')
  assert.ok(crt.reactionState.strength <= 0.18)
  assert.equal(crt.reactionState.recoilStrength, 0)
})

test('Release uses only a quiet crossing cue and power reset leaves no stale reaction', () => {
  const { controller, app, crt, tube, move } = controllerHarness()
  move(300, 160, 20)
  move(280, 160, 40)
  controller.frame(270)
  controller.frame(520)
  assert.equal(controller.state, CRT_CURSOR_STATE.CRT_ACTIVE)
  assert.equal(crt.reactionState.active, false)

  move(315, 160, 540)
  controller.frame(540)
  assert.equal(controller.state, CRT_CURSOR_STATE.RELEASING)
  assert.equal(tube.dataset.crtCursorReaction, 'release')
  assert.ok(crt.reactionState.strength > 0)
  assert.ok(crt.reactionState.strength <= 0.18)
  assert.equal(crt.reactionState.recoilStrength, 0)

  app.state.powerTarget = 0
  controller.frame(560)
  assert.equal(controller.state, CRT_CURSOR_STATE.NATIVE_OUTSIDE)
  assert.equal(crt.reactionState.active, false)
  assert.equal(tube.dataset.crtCursorReaction, 'idle')
})
