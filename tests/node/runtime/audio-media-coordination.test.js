import assert from 'node:assert/strict'
import test from 'node:test'
import { AudioPlaybackManager } from '../../../src/document/audio-playback-manager.js'
import { NarrationSession } from '../../../src/document/narration-session.js'

class FakeControl {
  constructor() {
    this.attributes = new Map([['aria-valuenow', '35']])
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
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
    this.duration = 120
    this.paused = true
    this.error = null
    this.attributes = new Map()
    this.listeners = new Map()
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

  load() {}
}

function createHarness(t) {
  const previous = {
    document: globalThis.document,
    MutationObserver: globalThis.MutationObserver,
    Audio: globalThis.Audio,
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
  }

  const document = new FakeDocument()
  const windowListeners = new Map()
  const beforePlay = []
  const audios = []

  globalThis.document = document
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
  globalThis.addEventListener = (type, listener) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set())
    windowListeners.get(type).add(listener)
  }
  globalThis.removeEventListener = (type, listener) => windowListeners.get(type)?.delete(listener)

  const manager = new AudioPlaybackManager({
    narrationSession: new NarrationSession(),
    beforePlay: track => beforePlay.push({ key: track.key, policy: track.policy }),
  })
  manager.setRoute('projects')

  t.after(() => {
    manager.destroy()
    globalThis.document = previous.document
    globalThis.MutationObserver = previous.MutationObserver
    globalThis.Audio = previous.Audio
    globalThis.addEventListener = previous.addEventListener
    globalThis.removeEventListener = previous.removeEventListener
  })

  const dispatchWindow = type => {
    for (const listener of windowListeners.get(type) || []) listener()
  }

  return { manager, document, beforePlay, audios, dispatchWindow }
}

test('managed narration and document audio both cross the runtime before-play seam', async t => {
  const { manager, beforePlay } = createHarness(t)
  manager.setDocument({
    id: 'astro',
    label: 'ASTRO',
    narration: '/media/narration/astro.mp3',
  })

  await manager.toggleNarration()
  await manager.toggle({ src: '/media/Astro/menu.mp3', label: 'MENU' })

  assert.deepEqual(beforePlay, [
    { key: 'narration:projects:astro', policy: 'narration' },
    { key: '/media/Astro/menu.mp3', policy: 'document' },
  ])
})

test('pagehide pauses active narration and does not auto-resume it', async t => {
  const { manager, audios, dispatchWindow } = createHarness(t)
  manager.setDocument({
    id: 'astro',
    label: 'ASTRO',
    narration: '/media/narration/astro.mp3',
  })

  await manager.toggleNarration()
  audios[0].currentTime = 29
  audios[0].emit('timeupdate')
  assert.equal(audios[0].paused, false)

  dispatchWindow('pagehide')
  assert.equal(audios[0].paused, true)
  assert.equal(manager.snapshotNarration().currentTime, 29)
  assert.equal(manager.snapshotNarration().playing, false)
})

test('visibility hide pauses narration and visibility restore stays paused', async t => {
  const { manager, document, audios } = createHarness(t)
  manager.setDocument({
    id: 'astro',
    label: 'ASTRO',
    narration: '/media/narration/astro.mp3',
  })

  await manager.toggleNarration()
  audios[0].currentTime = 41
  audios[0].emit('timeupdate')
  assert.equal(audios[0].paused, false)

  document.hidden = true
  document.dispatch('visibilitychange')
  assert.equal(audios[0].paused, true)
  assert.equal(manager.snapshotNarration().currentTime, 41)
  assert.equal(manager.snapshotNarration().playing, false)

  document.hidden = false
  document.dispatch('visibilitychange')
  assert.equal(audios[0].paused, true)
  assert.equal(manager.snapshotNarration().currentTime, 41)
  assert.equal(manager.snapshotNarration().playing, false)
})
