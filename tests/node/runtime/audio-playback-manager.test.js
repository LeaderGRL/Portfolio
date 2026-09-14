import assert from 'node:assert/strict'
import test from 'node:test'
import { AudioPlaybackManager } from '../../../src/document/audio-playback-manager.js'
import { NarrationSession } from '../../../src/document/narration-session.js'

class FakeControl {
  constructor(value = '35') {
    this.attributes = new Map([['aria-valuenow', String(value)]])
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }
}

class FakeDocument {
  constructor() {
    this.hidden = false
    this.volume = new FakeControl()
    this.listeners = new Map()
  }

  getElementById(id) {
    return id === 'volume' ? this.volume : null
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener()
  }
}

class FakeAudio {
  constructor() {
    this.preload = ''
    this.volume = 1
    this.currentTime = 0
    this.duration = 180
    this.paused = true
    this.error = null
    this.attributes = new Map()
    this.listeners = new Map()
    this.loadCalls = 0
  }

  get src() {
    return this.attributes.get('src') || ''
  }

  set src(value) {
    this.attributes.set('src', String(value))
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener)
  }

  emit(type) {
    for (const listener of this.listeners.get(type) || []) listener()
  }

  async play() {
    this.paused = false
    this.emit('play')
  }

  pause() {
    if (this.paused) return
    this.paused = true
    this.emit('pause')
  }

  load() {
    this.loadCalls++
  }
}

function createHarness(t, { volume = 35 } = {}) {
  const previous = {
    document: globalThis.document,
    MutationObserver: globalThis.MutationObserver,
    Audio: globalThis.Audio,
  }
  const fakeDocument = new FakeDocument()
  fakeDocument.volume.setAttribute('aria-valuenow', volume)
  const audios = []

  globalThis.document = fakeDocument
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  }
  globalThis.Audio = class extends FakeAudio {
    constructor() {
      super()
      audios.push(this)
    }
  }

  const session = new NarrationSession()
  const manager = new AudioPlaybackManager({ narrationSession: session })
  t.after(() => {
    manager.destroy()
    globalThis.document = previous.document
    globalThis.MutationObserver = previous.MutationObserver
    globalThis.Audio = previous.Audio
  })

  return { manager, session, audios, document: fakeDocument }
}

const astro = {
  id: 'astro',
  label: 'ASTRO',
  narration: '/media/narration/astro.mp3',
}

test('narration stays lazy until explicit playback activation', async t => {
  const { manager, audios } = createHarness(t)
  manager.setDocument(astro, 'projects')

  assert.equal(manager.hasNarration(), true)
  assert.equal(manager.snapshotNarration().state, 'idle')
  assert.equal(audios.length, 0)

  await manager.toggleNarration()
  assert.equal(audios.length, 1)
  assert.equal(audios[0].preload, 'none')
  assert.equal(audios[0].src, '/media/narration/astro.mp3')
})

test('narration progress survives document changes and restores paused', async t => {
  const { manager, session, audios } = createHarness(t)
  manager.setDocument(astro, 'projects')
  await manager.toggleNarration()

  audios[0].currentTime = 42
  audios[0].emit('timeupdate')
  manager.setDocument({ id: 'other', label: 'OTHER' }, 'projects')

  assert.equal(session.read('projects:astro').currentTime, 42)

  manager.setDocument(astro, 'projects')
  const restored = manager.snapshotNarration()
  assert.equal(restored.currentTime, 42)
  assert.equal(restored.state, 'paused')
  assert.equal(restored.playing, false)
  assert.equal(audios.length, 1)

  await manager.toggleNarration()
  assert.equal(audios.length, 2)
  assert.equal(audios[1].currentTime, 42)
  assert.equal(manager.snapshotNarration().playing, true)
})

test('ordinary document audio remains document-scoped', async t => {
  const { manager, audios } = createHarness(t)
  const soundtrack = { src: '/media/Astro/theme.mp3', label: 'Theme' }

  manager.setDocument({ id: 'astro', label: 'ASTRO' }, 'projects')
  await manager.toggle(soundtrack)
  audios[0].currentTime = 31
  audios[0].emit('timeupdate')

  manager.setDocument({ id: 'other', label: 'OTHER' }, 'projects')
  assert.equal(audios[0].src, '')
  assert.equal(manager.snapshot(soundtrack).currentTime, 0)
  assert.equal(manager.snapshot(soundtrack).state, 'idle')
})

test('narration seek updates live playback and session state', async t => {
  const { manager, session, audios } = createHarness(t)
  manager.setDocument(astro, 'projects')
  await manager.toggleNarration()

  const snapshot = manager.seekNarration(75)
  assert.equal(snapshot.currentTime, 75)
  assert.equal(audios[0].currentTime, 75)
  assert.equal(session.read('projects:astro').currentTime, 75)
})

test('ended narration resets to zero and remains activated but paused', async t => {
  const { manager, session, audios } = createHarness(t)
  manager.setDocument(astro, 'projects')
  await manager.toggleNarration()

  audios[0].duration = 90
  audios[0].currentTime = 90
  audios[0].emit('ended')

  const snapshot = manager.snapshotNarration()
  assert.equal(snapshot.currentTime, 0)
  assert.equal(snapshot.state, 'paused')
  assert.equal(snapshot.activated, true)
  assert.equal(session.read('projects:astro').currentTime, 0)
})

test('POWER and document visibility pause narration without autoplaying later', async t => {
  const { manager, audios, document } = createHarness(t)
  manager.setDocument(astro, 'projects')
  await manager.toggleNarration()
  audios[0].currentTime = 24

  manager.setPowered(false)
  assert.equal(audios[0].paused, true)
  assert.equal(manager.snapshotNarration().currentTime, 24)

  manager.setPowered(true)
  assert.equal(audios[0].paused, true)
  assert.equal(manager.snapshotNarration().playing, false)

  await manager.toggleNarration()
  assert.equal(audios[0].paused, false)
  document.hidden = true
  document.dispatch('visibilitychange')
  assert.equal(audios[0].paused, true)

  document.hidden = false
  document.dispatch('visibilitychange')
  assert.equal(audios[0].paused, true)
})

test('physical volume zero mutes narration without pausing playback', async t => {
  const { manager, audios } = createHarness(t, { volume: 0 })
  manager.setDocument(astro, 'projects')
  await manager.toggleNarration()

  assert.equal(audios[0].volume, 0)
  assert.equal(audios[0].paused, false)
  assert.equal(manager.snapshotNarration().playing, true)
})
