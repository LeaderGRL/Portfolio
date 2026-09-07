function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
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

export class AudioPlaybackManager {
  constructor({ onChange = () => {} } = {}) {
    this.onChange = onChange
    this.documentKey = null
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
    return String(block?.src || '')
  }

  ensureTrack(block) {
    const key = this.keyFor(block)
    if (!key) return null

    let track = this.tracks.get(key)
    if (!track) {
      track = {
        key,
        src: key,
        label: String(block.label || block.title || 'audio track'),
        durationHint: Number(block.duration) || 0,
        audio: null,
        state: 'idle',
        currentTime: 0,
        duration: Number(block.duration) || 0,
        error: null,
        listeners: new Set(),
        cleanupAudio: null,
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
        currentTime: 0,
        duration: Number(block?.duration) || 0,
      }
    }
    return this.snapshotTrack(track)
  }

  snapshotTrack(track) {
    const audio = track.audio
    const duration = Number(audio?.duration) || track.duration || track.durationHint || 0
    const currentTime = Number(audio?.currentTime) || track.currentTime || 0
    return {
      state: track.state,
      playing: track.state === 'playing',
      failed: track.state === 'error',
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

  setDocument(item) {
    const nextKey = item?.id || item?.slug || item?.label || null
    if (nextKey === this.documentKey) return
    this.releaseAll('document-change')
    this.tracks.clear()
    this.documentKey = nextKey
  }

  setPowered(powered) {
    const next = Boolean(powered)
    if (next === this.powered) return
    this.powered = next
    if (!next) this.releaseAll('power-off')
  }

  syncVolume() {
    this.volume = readPanelVolume()
    for (const track of this.tracks.values()) {
      if (track.audio) track.audio.volume = this.volume
    }
  }

  createAudio(track) {
    if (track.audio) return track.audio

    const audio = new Audio()
    audio.preload = 'none'
    audio.volume = this.volume
    track.audio = audio

    const onLoadedMetadata = () => {
      track.duration = Number(audio.duration) || track.durationHint || 0
      this.emit(track, 'metadata')
    }
    const onDurationChange = () => {
      track.duration = Number(audio.duration) || track.durationHint || 0
      this.emit(track, 'duration')
    }
    const onPlay = () => {
      track.state = 'playing'
      track.error = null
      this.emit(track, 'play')
    }
    const onPause = () => {
      track.currentTime = Number(audio.currentTime) || track.currentTime || 0
      if (track.state !== 'error' && track.state !== 'ended' && track.state !== 'idle') {
        track.state = 'paused'
      }
      this.emit(track, 'pause')
    }
    const onEnded = () => {
      track.currentTime = Number(audio.duration) || track.duration || 0
      track.state = 'ended'
      this.emit(track, 'ended')
    }
    const onTimeUpdate = () => {
      track.currentTime = Number(audio.currentTime) || 0
      this.emit(track, 'time')
    }
    const onSeeked = () => {
      track.currentTime = Number(audio.currentTime) || 0
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
    return audio
  }

  fail(track, error) {
    track.state = 'error'
    track.error = error || track.audio?.error || new Error('Unknown audio error')
    if (track.audio && !track.audio.paused) track.audio.pause()
    console.warn(`Document audio failed: ${track.src}`, track.error)
    this.emit(track, 'error')
  }

  pauseOthers(currentTrack) {
    for (const track of this.tracks.values()) {
      if (track === currentTrack || !track.audio || track.audio.paused) continue
      track.audio.pause()
    }
  }

  pauseAll() {
    for (const track of this.tracks.values()) {
      if (!track.audio || track.audio.paused) continue
      track.audio.pause()
    }
  }

  releaseTrack(track, reason = 'release') {
    if (!track) return
    const audio = track.audio
    track.state = 'idle'
    track.error = null
    track.currentTime = 0
    track.duration = track.durationHint || 0

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
    this.volumeObserver?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }
}

export { formatTime }
