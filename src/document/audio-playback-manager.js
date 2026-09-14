import { NarrationSession, narrationDocumentKey } from './narration-session.js'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function finiteNonNegative(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const rest = Math.floor(safe % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function readPanelVolume() {
  const value = Number(document.getElementById('volume')?.getAttribute('aria-valuenow'))
  return Number.isFinite(value) ? clamp(value / 100, 0, 1) : 0.35
}

function trackPolicy(block) {
  return block?.playbackPolicy === 'narration' ? 'narration' : 'document'
}

export class AudioPlaybackManager {
  constructor({ onChange = () => {}, narrationSession = new NarrationSession() } = {}) {
    this.onChange = onChange
    this.narrationSession = narrationSession
    this.route = ''
    this.documentKey = null
    this.narrationBlock = null
    this.tracks = new Map()
    this.powered = true
    this.volume = readPanelVolume()

    this.volumeControl = document.getElementById('volume')
    this.volumeObserver = this.volumeControl ? new MutationObserver(() => this.syncVolume()) : null
    this.volumeObserver?.observe(this.volumeControl, {
      attributes: true,
      attributeFilter: ['aria-valuenow'],
    })

    this.onVisibilityChange = () => {
      if (document.hidden) this.pauseAll()
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  keyFor(block) {
    if (trackPolicy(block) === 'narration') return `narration:${String(block?.sessionKey || '')}`
    return String(block?.src || '')
  }

  ensureTrack(block) {
    const key = this.keyFor(block)
    if (!key || key === 'narration:') return null

    const policy = trackPolicy(block)
    let track = this.tracks.get(key)
    if (!track) {
      const restored = policy === 'narration'
        ? this.narrationSession.read(block.sessionKey)
        : { activated: false, currentTime: 0, duration: 0 }
      track = {
        key,
        src: String(block.src || ''),
        label: String(block.label || block.title || 'audio track'),
        policy,
        sessionKey: policy === 'narration' ? String(block.sessionKey || '') : '',
        activated: policy === 'narration' ? restored.activated : false,
        durationHint: Number(block.duration) || 0,
        audio: null,
        state: policy === 'narration' && restored.activated ? 'paused' : 'idle',
        currentTime: policy === 'narration' ? restored.currentTime : 0,
        duration: Math.max(Number(block.duration) || 0, policy === 'narration' ? restored.duration : 0),
        error: null,
        listeners: new Set(),
        cleanupAudio: null,
        restorePending: policy === 'narration' && restored.currentTime > 0,
      }
      this.tracks.set(key, track)
    } else {
      track.label = String(block.label || block.title || track.label)
      track.durationHint = Number(block.duration) || track.durationHint || 0
      if (!track.duration) track.duration = track.durationHint
    }
    return track
  }

  snapshot(block) {
    const track = this.ensureTrack(block)
    if (!track) {
      return {
        state: 'idle',
        playing: false,
        failed: false,
        activated: false,
        currentTime: 0,
        duration: Number(block?.duration) || 0,
      }
    }
    return this.snapshotTrack(track)
  }

  snapshotTrack(track) {
    const audio = track.audio
    const audioDuration = Number(audio?.duration)
    const duration = Number.isFinite(audioDuration) && audioDuration > 0
      ? audioDuration
      : track.duration || track.durationHint || 0
    const audioTime = Number(audio?.currentTime)
    const currentTime = track.restorePending
      ? track.currentTime
      : Number.isFinite(audioTime) && audioTime >= 0
        ? audioTime
        : track.currentTime || 0
    return {
      state: track.state,
      playing: track.state === 'playing',
      failed: track.state === 'error',
      activated: Boolean(track.activated),
      currentTime,
      duration,
      error: track.error,
    }
  }

  subscribe(block, listener) {
    const track = this.ensureTrack(block)
    if (!track || typeof listener !== 'function') return () => {}
    track.listeners.add(listener)
    listener(this.snapshotTrack(track), { reason: 'mount' })
    return () => track.listeners.delete(listener)
  }

  emit(track, reason) {
    if (!track) return
    const snapshot = this.snapshotTrack(track)
    for (const listener of track.listeners) listener(snapshot, { reason })
    if (track.listeners.size) this.onChange(snapshot, track, reason)
  }

  persistNarration(track) {
    if (!track || track.policy !== 'narration' || !track.sessionKey) return
    const snapshot = this.snapshotTrack(track)
    this.narrationSession.update(track.sessionKey, {
      activated: track.activated,
      currentTime: snapshot.currentTime,
      duration: snapshot.duration,
    })
  }

  setRoute(route) {
    this.route = String(route || '')
  }

  setDocument(item) {
    const nextKey = narrationDocumentKey(this.route, item) || null
    const nextNarration = item?.narration && nextKey
      ? {
          src: String(item.narration),
          label: String(item.label || item.title || item.id || 'narration'),
          playbackPolicy: 'narration',
          sessionKey: nextKey,
        }
      : null

    if (nextKey === this.documentKey && nextNarration?.src === this.narrationBlock?.src) return

    this.releaseAll('document-change')
    this.tracks.clear()
    this.documentKey = nextKey
    this.narrationBlock = nextNarration
  }

  hasNarration() {
    return Boolean(this.narrationBlock)
  }

  snapshotNarration() {
    return this.narrationBlock ? this.snapshot(this.narrationBlock) : null
  }

  subscribeNarration(listener) {
    return this.narrationBlock ? this.subscribe(this.narrationBlock, listener) : () => {}
  }

  async toggleNarration() {
    if (!this.narrationBlock) return
    await this.toggle(this.narrationBlock)
  }

  seekNarration(seconds) {
    if (!this.narrationBlock) return null
    return this.seek(this.narrationBlock, seconds)
  }

  setPowered(powered) {
    const next = Boolean(powered)
    if (next === this.powered) return
    this.powered = next
    if (!next) {
      for (const track of this.tracks.values()) {
        if (track.policy === 'narration') this.pauseTrack(track)
        else this.releaseTrack(track, 'power-off')
      }
    }
  }

  syncVolume() {
    this.volume = readPanelVolume()
    for (const track of this.tracks.values()) {
      if (track.audio) track.audio.volume = this.volume
    }
  }

  applyRestoredPosition(track, audio) {
    if (!track?.restorePending || track.policy !== 'narration') return
    const duration = finiteNonNegative(audio.duration) || track.duration || track.durationHint || 0
    const target = duration > 0 ? clamp(track.currentTime, 0, duration) : track.currentTime
    try {
      audio.currentTime = target
      track.currentTime = target
      track.restorePending = false
    } catch {
      // Metadata may not be available yet. loadedmetadata retries the restore.
    }
  }

  createAudio(track) {
    if (track.audio) return track.audio

    const audio = new Audio()
    audio.preload = 'none'
    audio.volume = this.volume
    track.audio = audio

    const onLoadedMetadata = () => {
      track.duration = Number(audio.duration) || track.durationHint || track.duration || 0
      this.applyRestoredPosition(track, audio)
      this.persistNarration(track)
      this.emit(track, 'metadata')
    }
    const onDurationChange = () => {
      track.duration = Number(audio.duration) || track.durationHint || track.duration || 0
      this.persistNarration(track)
      this.emit(track, 'duration')
    }
    const onPlay = () => {
      track.state = 'playing'
      track.activated = true
      track.error = null
      this.persistNarration(track)
      this.emit(track, 'play')
    }
    const onPause = () => {
      track.currentTime = finiteNonNegative(audio.currentTime)
      if (track.state !== 'error' && track.state !== 'ended' && track.state !== 'idle') {
        track.state = 'paused'
      }
      this.persistNarration(track)
      this.emit(track, 'pause')
    }
    const onEnded = () => {
      if (track.policy === 'narration') {
        track.currentTime = 0
        track.state = 'paused'
        track.activated = true
        track.restorePending = false
        try {
          audio.currentTime = 0
        } catch {
          // The session position is authoritative if the media element rejects the seek.
        }
        this.narrationSession.resetPosition(track.sessionKey)
      } else {
        track.currentTime = Number(audio.duration) || track.duration || 0
        track.state = 'ended'
      }
      this.persistNarration(track)
      this.emit(track, 'ended')
    }
    const onTimeUpdate = () => {
      track.currentTime = finiteNonNegative(audio.currentTime)
      this.persistNarration(track)
      this.emit(track, 'time')
    }
    const onSeeked = () => {
      track.currentTime = finiteNonNegative(audio.currentTime)
      track.restorePending = false
      this.persistNarration(track)
      this.emit(track, 'seek')
    }
    const onError = () => this.fail(track, audio.error)

    track.cleanupAudio = () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('seeked', onSeeked)
      audio.removeEventListener('error', onError)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata, { passive: true })
    audio.addEventListener('durationchange', onDurationChange, { passive: true })
    audio.addEventListener('play', onPlay, { passive: true })
    audio.addEventListener('pause', onPause, { passive: true })
    audio.addEventListener('ended', onEnded, { passive: true })
    audio.addEventListener('timeupdate', onTimeUpdate, { passive: true })
    audio.addEventListener('seeked', onSeeked, { passive: true })
    audio.addEventListener('error', onError, { passive: true })

    return audio
  }

  ensureSource(track) {
    const audio = this.createAudio(track)
    if (!audio.getAttribute('src')) audio.src = track.src
    this.applyRestoredPosition(track, audio)
    return audio
  }

  fail(track, error) {
    track.state = 'error'
    track.activated = track.activated || track.policy === 'narration'
    track.error = error || track.audio?.error || new Error('Unknown audio error')
    if (track.audio && !track.audio.paused) track.audio.pause()
    this.persistNarration(track)
    console.warn(`Document audio failed: ${track.src}`, track.error)
    this.emit(track, 'error')
  }

  pauseTrack(track) {
    if (!track) return
    if (track.audio && !track.audio.paused) {
      track.audio.pause()
      return
    }
    if (track.policy === 'narration' && track.state === 'playing') track.state = 'paused'
    this.persistNarration(track)
  }

  pauseOthers(currentTrack) {
    for (const track of this.tracks.values()) {
      if (track === currentTrack || !track.audio || track.audio.paused) continue
      track.audio.pause()
    }
  }

  pauseAll() {
    for (const track of this.tracks.values()) this.pauseTrack(track)
  }

  releaseTrack(track, reason = 'release') {
    if (!track) return
    const audio = track.audio

    if (track.policy === 'narration') {
      if (audio) track.currentTime = finiteNonNegative(audio.currentTime)
      track.state = track.activated ? 'paused' : 'idle'
      track.error = null
      this.persistNarration(track)
    } else {
      track.state = 'idle'
      track.error = null
      track.currentTime = 0
      track.duration = track.durationHint || 0
    }

    if (audio) {
      if (!audio.paused) audio.pause()
      track.cleanupAudio?.()
      track.cleanupAudio = null
      audio.removeAttribute('src')
      try {
        audio.load()
      } catch (error) {
        console.warn('Unable to release document audio element', error)
      }
      track.audio = null
    }
    this.emit(track, reason)
  }

  releaseAll(reason = 'release-all') {
    for (const track of this.tracks.values()) this.releaseTrack(track, reason)
  }

  seek(block, seconds) {
    const track = this.ensureTrack(block)
    if (!track) return null

    const duration = this.snapshotTrack(track).duration
    const requested = finiteNonNegative(seconds)
    const target = duration > 0 ? clamp(requested, 0, duration) : requested
    track.currentTime = target
    track.restorePending = track.policy === 'narration' && !track.audio && target > 0

    if (track.audio) {
      try {
        track.audio.currentTime = target
        track.restorePending = false
      } catch {
        track.restorePending = track.policy === 'narration' && target > 0
      }
    }

    this.persistNarration(track)
    this.emit(track, 'seek')
    return this.snapshotTrack(track)
  }

  async toggle(block) {
    const track = this.ensureTrack(block)
    if (!track || !this.powered) return

    if (track.audio && track.state === 'playing' && !track.audio.paused) {
      track.audio.pause()
      return
    }

    this.pauseOthers(track)
    this.syncVolume()

    if (track.state === 'error') this.releaseTrack(track, 'retry')
    if (track.policy === 'narration') {
      track.activated = true
      this.persistNarration(track)
    }

    const audio = this.ensureSource(track)
    try {
      await audio.play()
    } catch (error) {
      if (error?.name !== 'AbortError') this.fail(track, error)
    }
  }

  destroy() {
    this.releaseAll('destroy')
    this.tracks.clear()
    this.narrationBlock = null
    this.volumeObserver?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }
}

export { formatTime }
