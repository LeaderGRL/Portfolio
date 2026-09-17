import assert from 'node:assert/strict'
import test from 'node:test'

globalThis.matchMedia = () => ({ matches: false })
const { CRT } = await import('../../../src/crt.js')

const renderState = {
  crt: 1,
  power: 1,
  time: 1,
  warm: 1,
  static: 0,
  degauss: 0,
}

function createInstrumentedGl() {
  const uploads = { source: 0, cursor: 0 }
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
    createTexture: () => ({ id: ++textureId }),
    texImage2D: (...args) => {
      if (args.length === 6) uploads.source += 1
      else if (args.length === 9 && args[8] instanceof Uint8Array) uploads.cursor += 1
    },
  }, {
    get: (target, key) => key in target
      ? target[key]
      : /^[A-Z0-9_]+$/.test(key)
        ? key
        : () => ({}),
  })

  return { gl, uploads }
}

test('multi-frame cursor-only motion never re-uploads the stabilized CRT source', () => {
  const { gl, uploads } = createInstrumentedGl()
  const source = { width: 480, height: 360 }
  const canvas = { getContext: () => gl, width: 480, height: 360 }
  const crt = new CRT(canvas, source)

  assert.equal(crt.ok, true)
  assert.equal(crt.render(renderState, true), true)
  const stableSourceUploads = uploads.source
  const stableCursorUploads = uploads.cursor

  assert.equal(stableSourceUploads, 1)
  assert.equal(stableCursorUploads, 1)

  for (let frame = 0; frame < 180; frame += 1) {
    const phase = frame / 179
    crt.setCursorState({
      visible: true,
      hotspotUv: {
        x: 0.12 + phase * 0.76,
        y: 0.5 + Math.sin(phase * Math.PI * 4) * 0.28,
      },
      angle: phase * Math.PI * 2,
      compression: (frame % 12) / 60,
      hoverIntensity: frame % 2 ? 0.48 : 0,
      clickImpulse: frame % 45 === 0 ? 0.52 : 0,
      recompositionStrength: Math.max(0, 1 - phase * 4),
    })

    assert.equal(crt.render({ ...renderState, time: 1 + frame / 60 }, false), true)
  }

  assert.equal(
    uploads.source,
    stableSourceUploads,
    'Pointer-only cursor frames must not dirty or upload the source texture',
  )
  assert.equal(
    uploads.cursor,
    stableCursorUploads,
    'The immutable cursor raster must not be recreated while the pointer moves',
  )

  assert.equal(crt.render({ ...renderState, time: 5 }, true), true)
  assert.equal(
    uploads.source,
    stableSourceUploads + 1,
    'A real source invalidation must still upload exactly once',
  )
})
