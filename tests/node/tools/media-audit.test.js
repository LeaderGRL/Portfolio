import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  decodeDataUri,
  mp4DurationSeconds,
  mp4TrackSwapsDimensions,
  parseGlb,
  parseSvg,
  parseSvgLength,
  referenceTokens,
} from '../../../tools/media-audit.mjs'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function glb(json, binary = null) {
  const jsonSource = Buffer.from(JSON.stringify(json))
  const jsonPadding = (4 - (jsonSource.length % 4)) % 4
  const jsonPayload = Buffer.concat([jsonSource, Buffer.alloc(jsonPadding, 0x20)])
  const chunks = [{ type: 0x4e4f534a, payload: jsonPayload }]
  if (binary) {
    const binaryPadding = (4 - (binary.length % 4)) % 4
    chunks.push({ type: 0x004e4942, payload: Buffer.concat([binary, Buffer.alloc(binaryPadding)]) })
  }

  const size = 12 + chunks.reduce((total, chunk) => total + 8 + chunk.payload.length, 0)
  const buffer = Buffer.alloc(size)
  buffer.write('glTF', 0, 'ascii')
  buffer.writeUInt32LE(2, 4)
  buffer.writeUInt32LE(size, 8)
  let offset = 12
  for (const chunk of chunks) {
    buffer.writeUInt32LE(chunk.payload.length, offset)
    buffer.writeUInt32LE(chunk.type, offset + 4)
    chunk.payload.copy(buffer, offset + 8)
    offset += 8 + chunk.payload.length
  }
  return buffer
}

function trackHeader(matrix) {
  const buffer = Buffer.alloc(84)
  buffer.writeUInt32BE(buffer.length, 0)
  buffer.write('tkhd', 4, 'ascii')
  for (const [offset, value] of [[48, matrix.a], [52, matrix.b], [60, matrix.c], [64, matrix.d]]) {
    buffer.writeInt32BE(value, offset)
  }
  return { buffer, trak: { dataOffset: 0, end: buffer.length } }
}

test('decodes percent-escaped data URI bytes without UTF-8 coercion', () => {
  assert.deepEqual(decodeDataUri('data:application/octet-stream,%FF%00A'), Buffer.from([0xff, 0x00, 0x41]))
  assert.equal(decodeDataUri('data:application/octet-stream,%F'), null)
})

test('uses viewBox dimensions for relative SVG sizes and converts absolute units', () => {
  assert.deepEqual(
    parseSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 800 600"/>')),
    { codec: 'svg', width: 800, height: 600 },
  )
  assert.equal(parseSvgLength('2.54cm'), 96)
  assert.equal(parseSvgLength('72pt'), 96)
  assert.equal(parseSvgLength('100%'), null)
})

test('treats ISO BMFF unknown-duration sentinels as absent', () => {
  assert.equal(mp4DurationSeconds(0xffffffff, 1000, 0), null)
  assert.equal(mp4DurationSeconds(0xffffffffffffffffn, 1000, 1), null)
  assert.equal(mp4DurationSeconds(2500, 1000, 0), 2.5)
})

test('detects quarter-turn MP4 track matrices', () => {
  const identity = trackHeader({ a: 65536, b: 0, c: 0, d: 65536 })
  const rotated = trackHeader({ a: 0, b: 65536, c: -65536, d: 0 })
  assert.equal(mp4TrackSwapsDimensions(identity.buffer, identity.trak), false)
  assert.equal(mp4TrackSwapsDimensions(rotated.buffer, rotated.trak), true)
})

test('encodes every reserved character in public media path segments', () => {
  const file = path.join(process.cwd(), 'public', 'media', 'demo #1?.mp4')
  assert.deepEqual(referenceTokens(file), [
    '/media/demo #1?.mp4',
    '/media/demo%20%231%3F.mp4',
  ])
})

test('rejects corrupt data URI images embedded in GLB files', () => {
  const model = glb({
    asset: { version: '2.0' },
    images: [{ uri: 'data:image/png;base64,AA==' }],
  })
  assert.equal(parseGlb(model), null)
})

test('rejects embedded GLB images that do not match their declared format', () => {
  const model = glb({
    asset: { version: '2.0' },
    images: [{ uri: `data:image/jpeg;base64,${PNG_1X1.toString('base64')}` }],
  })
  assert.equal(parseGlb(model), null)
})

test('decodes data URI and buffer-view images embedded in GLB files', () => {
  const dataUriModel = glb({
    asset: { version: '2.0' },
    images: [{ uri: `data:image/png;base64,${PNG_1X1.toString('base64')}` }],
  })
  assert.deepEqual(parseGlb(dataUriModel), { codec: 'glb2' })

  const bufferViewModel = glb({
    asset: { version: '2.0' },
    buffers: [{ byteLength: PNG_1X1.length }],
    bufferViews: [{ buffer: 0, byteLength: PNG_1X1.length }],
    images: [{ bufferView: 0, mimeType: 'image/png' }],
  }, PNG_1X1)
  assert.deepEqual(parseGlb(bufferViewModel), { codec: 'glb2' })

  const alignedImage = Buffer.concat([PNG_1X1, Buffer.alloc(3, 0x20)])
  const alignedBufferViewModel = glb({
    asset: { version: '2.0' },
    buffers: [{ byteLength: alignedImage.length }],
    bufferViews: [{ buffer: 0, byteLength: alignedImage.length }],
    images: [{ bufferView: 0, mimeType: 'image/png' }],
  }, alignedImage)
  assert.deepEqual(parseGlb(alignedBufferViewModel), { codec: 'glb2' })
})
