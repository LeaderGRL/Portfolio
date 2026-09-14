import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resourceCategory,
  summarizeFrameSamplesByMode,
  summarizeFrameTimes,
  summarizeResources,
} from '../../../src/performance-instrumentation.js'

test('frame summaries expose stable counts and percentiles', () => {
  const frames = summarizeFrameTimes([16, 17, 18, 60])

  assert.equal(frames.samples, 4)
  assert.equal(frames.p50Ms, 17)
  assert.equal(frames.p95Ms, 60)
  assert.equal(frames.over50Ms, 1)
})

test('resource summaries keep categories and local paths stable', () => {
  const entries = [
    { name: 'https://local.test/assets/app.js', initiatorType: 'script', duration: 12, transferSize: 100 },
    { name: 'https://local.test/assets/app.css', initiatorType: 'link', duration: 5, transferSize: 50 },
    { name: 'https://local.test/assets/font.woff2', initiatorType: 'css', duration: 3, transferSize: 25 },
    { name: 'https://local.test/assets/chassis.webp', initiatorType: 'img', duration: 20, transferSize: 200 },
    { name: 'https://local.test/assets/edge-fill.webp', initiatorType: 'css', duration: 6, transferSize: 75 },
    { name: 'https://local.test/assets/performance-instrumentation.js', initiatorType: 'script', duration: 2, transferSize: 10 },
  ]
  const resources = summarizeResources(entries)

  assert.equal(resourceCategory(entries[0]), 'script')
  assert.equal(resourceCategory(entries[2]), 'font')
  assert.equal(resourceCategory(entries[4]), 'image')
  assert.equal(resources.categories.image.transferBytes, 275)
  assert.equal(resources.categories.instrumentation.count, 1)
  assert.ok(resources.entries.every(entry => entry.name.startsWith('/assets/')))
})

test('frame samples remain partitioned by active runtime mode', () => {
  const frameModes = summarizeFrameSamplesByMode([
    { deltaMs: 16, mode: { crtEnabled: true, fullscreen: false, displayMode: 'terminal', mediaOpen: false, powerEnabled: true } },
    { deltaMs: 17, mode: { crtEnabled: true, fullscreen: false, displayMode: 'terminal', mediaOpen: false, powerEnabled: true } },
    { deltaMs: 18, mode: { crtEnabled: false, fullscreen: false, displayMode: 'terminal', mediaOpen: false, powerEnabled: true } },
  ])

  assert.equal(frameModes.length, 2)
  assert.ok(frameModes.some(bucket => bucket.mode.crtEnabled === false && bucket.timing.samples === 1))
})
