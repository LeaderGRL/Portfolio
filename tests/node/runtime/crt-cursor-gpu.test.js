import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CRT_CURSOR_SHAPE,
  DEFAULT_CRT_CURSOR_GPU_STATE,
  normalizeCrtCursorGpuState,
  rasterizeCrtCursorShape,
} from '../../../src/crt-cursor-shape.js'

globalThis.matchMedia = () => ({ matches: false })
const { CRT, FRAG_CRT, FRAG_PERSIST } = await import('../../../src/crt.js')

const state = {
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
  let textureId = 0

  const gl = new Proxy({
    NO_ERROR: 0,
    getParameter: key => key === 'MAX_VIEWPORT_DIMS' ? [4096, 4096] : 4096,
    checkFramebufferStatus: () => 'FRAMEBUFFER_COMPLETE',
    getError: () => 0,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getUniformLocation: (_program, name) => name,
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

  return { gl, uniforms, uploads }
}

test('canonical cursor shape is immutable, tip-anchored and rasterized once-ready', () => {
  assert.equal(Object.isFrozen(CRT_CURSOR_SHAPE), true)
  assert.deepEqual(CRT_CURSOR_SHAPE.points[0], [0, 0])
  assert.equal(DEFAULT_CRT_CURSOR_GPU_STATE.visible, false)

  const pixels = rasterizeCrtCursorShape()
  assert.equal(pixels.length, CRT_CURSOR_SHAPE.textureSize ** 2 * 4)

  let opaquePixels = 0
  let greenOuterPixels = 0
  let mintCorePixels = 0
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) continue
    opaquePixels += 1
    if (pixels[offset + 1] > pixels[offset] * 1.8) greenOuterPixels += 1
    if (pixels[offset] > 200 && pixels[offset + 1] > 220 && pixels[offset + 2] > 200) mintCorePixels += 1
  }
  assert.ok(opaquePixels > 0)
  assert.ok(greenOuterPixels > 0)
  assert.ok(mintCorePixels > 0)
})

test('cursor runtime state normalizes partial updates without moving the hotspot', () => {
  const first = normalizeCrtCursorGpuState({
    visible: true,
    hotspotUv: { x: 0.2, y: 0.8 },
    angle: Math.PI / 3,
    sizePx: 24,
  })
  const second = normalizeCrtCursorGpuState({
    compression: 2,
    hoverIntensity: -1,
    clickImpulse: 0.4,
    recompositionStrength: 0.25,
  }, first)

  assert.equal(second.visible, true)
  assert.deepEqual(second.hotspotUv, { x: 0.2, y: 0.8 })
  assert.equal(second.angle, Math.PI / 3)
  assert.equal(second.sizePx, 24)
  assert.equal(second.compression, 1)
  assert.equal(second.hoverIntensity, 0)
  assert.equal(second.clickImpulse, 0.4)
  assert.equal(second.recompositionStrength, 0.25)
})

test('cursor emission is excluded from persistence and adds into the shared tube signal', () => {
  assert.equal(FRAG_PERSIST.includes('uCursor'), false)
  assert.equal(FRAG_PERSIST.includes('cursorEmission'), false)
  assert.ok(FRAG_CRT.includes('vec2 suv = signalUv(vUv);'))
  assert.ok(FRAG_CRT.includes('gCursorSignalHotspot = signalUv(uCursorHotspot);'))
  assert.ok(FRAG_CRT.includes('if (uCursorVisible < 0.5) return base;'))
  assert.ok(FRAG_CRT.includes('return base + cursorEmission(suv);'))
  assert.equal(FRAG_CRT.includes('return max(base, cursorEmission(suv));'), false)
})

test('GPU cursor resource initializes once and cursor-only updates do not upload the raster source', () => {
  const { gl, uniforms, uploads } = createFakeGl()
  const source = { width: 480, height: 360 }
  const canvas = { getContext: () => gl, width: 480, height: 360 }
  const crt = new CRT(canvas, source)

  assert.equal(crt.ok, true)
  assert.equal(crt.cursorResourceInitCount, 1)
  assert.equal(uploads.cursor, 1)

  assert.equal(crt.render(state, false), true)
  assert.equal(uploads.source, 1)

  crt.setCursorState({
    visible: true,
    hotspotUv: { x: 0.74, y: 0.31 },
    angle: 0.7,
    sizePx: 22,
    compression: 0.3,
    hoverIntensity: 0.5,
    clickImpulse: 0.6,
    recompositionStrength: 0.2,
  })
  assert.equal(crt.render(state, false), true)

  assert.equal(uploads.cursor, 1)
  assert.equal(uploads.source, 1)
  assert.equal(crt.cursorResourceInitCount, 1)
  assert.equal(uniforms.uCursorVisible, 1)
  assert.deepEqual(uniforms.uCursorHotspot, [0.74, 0.31])
  assert.equal(uniforms.uCursorAngle, 0.7)
  assert.equal(uniforms.uCursorSizePx, 22)
  assert.equal(uniforms.uCursorCompression, 0.3)
  assert.equal(uniforms.uCursorHover, 0.5)
  assert.equal(uniforms.uCursorClick, 0.6)
  assert.equal(uniforms.uCursorRecompose, 0.2)

  crt.resize(480, 360, 2)
  assert.equal(canvas.width, 960)
  assert.equal(canvas.height, 720)
  assert.equal(crt.render(state, false), true)
  assert.equal(uniforms.uCursorSizePx, 44)
  assert.equal(uploads.source, 1)
  assert.equal(uploads.cursor, 1)

  // The effective scale must update even when a CSS resize happens to keep the
  // same backing dimensions and resize() takes its early-return path.
  crt.resize(960, 720, 1)
  assert.equal(canvas.width, 960)
  assert.equal(canvas.height, 720)
  assert.equal(crt.render(state, false), true)
  assert.equal(uniforms.uCursorSizePx, 22)
  assert.equal(uploads.source, 1)

  // Fullscreen passes an already DPR-scaled backing size with dpr=1. Derive
  // cursor density from the canvas's untransformed CSS box so a 2000px backing
  // displayed at 1000 CSS px still preserves a 22 CSS px cursor as 44 pixels.
  canvas.offsetWidth = 1000
  canvas.offsetHeight = 500
  crt.resize(2000, 1000, 1)
  assert.equal(canvas.width, 2000)
  assert.equal(canvas.height, 1000)
  assert.equal(crt.render(state, false), true)
  assert.equal(uniforms.uCursorSizePx, 44)
  assert.equal(uploads.source, 1)
  assert.equal(uploads.cursor, 1)

  assert.equal(crt.render({ ...state, crt: 0 }, false), true)
  assert.equal(uniforms.uCrt, 0)
  assert.equal(uniforms.uCursorVisible, 1)
  assert.equal(uploads.source, 1)

  assert.equal(crt.render(state, true), true)
  assert.equal(uploads.source, 2)
  assert.equal(uploads.cursor, 1)
})

test('WebGL fallback never owns or hides the native cursor', () => {
  const style = {}
  const crt = new CRT({ getContext: () => null, style }, { width: 480, height: 360 })
  assert.equal(crt.ok, false)
  assert.equal(style.cursor, undefined)
  crt.setCursorState({ visible: true, hotspotUv: { x: 0.3, y: 0.4 } })
  assert.equal(crt.getCursorState().visible, true)
  assert.equal(crt.render(state, false), false)
  assert.equal(style.cursor, undefined)
})