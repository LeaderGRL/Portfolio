import assert from 'node:assert/strict'
import test from 'node:test'
import { installTubeQuadFallback } from '../../../src/crt-cursor-runtime-controller.js'

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
