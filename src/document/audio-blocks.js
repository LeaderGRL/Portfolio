import { formatTime } from './audio-playback-manager.js'

let audioControlId = 0

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function paintAudio(ctx, block, layout, env, playback) {
  const { colors } = env
  const x = layout.x
  const y = layout.y
  const width = layout.width
  const height = layout.height - 10
  const snapshot = playback?.snapshot(block) || {}
  const failed = Boolean(snapshot.failed)
  const playing = Boolean(snapshot.playing)
  const duration = Number(snapshot.duration) || Number(block.duration) || 0
  const current = Number(snapshot.currentTime) || 0
  const progress = duration > 0 ? clamp(current / duration, 0, 1) : 0
  const title = String(block.label || block.title || 'AUDIO TRACK').toUpperCase()
  const credit = String(block.credit || '').toUpperCase()

  ctx.fillStyle = colors.panel
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = failed ? colors.amber : colors.dim
  ctx.strokeRect(x + .5, y + .5, width - 1, height - 1)

  ctx.fillStyle = playing ? colors.core : colors.amber
  ctx.font = '700 10px ui-monospace, "SFMono-Regular", Consolas, monospace'
  ctx.fillText(failed ? '↻ RETRY' : playing ? '❚❚ PAUSE' : '▶ PLAY', x + 12, y + 24)

  ctx.fillStyle = colors.bright
  ctx.font = '700 10px ui-monospace, "SFMono-Regular", Consolas, monospace'
  ctx.fillText(title, x + 94, y + 24)

  if (credit) {
    ctx.fillStyle = colors.mid
    ctx.font = '600 7px ui-monospace, "SFMono-Regular", Consolas, monospace'
    ctx.fillText(credit, x + 94, y + 39)
  }

  const barX = x + 12
  const barY = y + 58
  const barW = width - 24
  ctx.fillStyle = 'rgba(47,208,109,.13)'
  ctx.fillRect(barX, barY, barW, 5)
  ctx.fillStyle = failed ? colors.amber : colors.mid
  ctx.fillRect(barX, barY, barW * progress, 5)

  ctx.fillStyle = colors.dim
  ctx.font = '600 7px ui-monospace, "SFMono-Regular", Consolas, monospace'
  ctx.fillText(failed ? 'AUDIO UNAVAILABLE' : `${formatTime(current)} / ${duration ? formatTime(duration) : '--:--'}`, barX, barY + 19)
  ctx.textAlign = 'right'
  ctx.fillText(failed ? 'CLICK TO RETRY' : 'CLICK TO PLAY / PAUSE', x + width - 12, barY + 19)
  ctx.textAlign = 'left'
}

function liveAnnouncement(state, label) {
  if (state === 'playing') return `Playing ${label}.`
  if (state === 'paused') return `Paused ${label}.`
  if (state === 'ended') return `${label} finished.`
  if (state === 'error') return `Audio unavailable for ${label}. Activate the control to retry.`
  return ''
}

function progressDescription(snapshot) {
  if (snapshot.failed) return 'Audio unavailable. Activate the control to retry.'
  const duration = Number(snapshot.duration) || 0
  const current = Number(snapshot.currentTime) || 0
  const state = snapshot.playing ? 'Playing' : 'Paused'
  if (!duration) return `${state}. Duration will be available after playback starts.`
  return `${state}, ${formatTime(current)} of ${formatTime(duration)}.`
}

function installTouchScroll(host, context) {
  const reader = context?.rasteriser?.reader
  if (!reader) return () => {}

  host.style.touchAction = 'none'
  let gesture = null
  let suppressClickUntil = 0

  const onPointerDown = event => {
    if (event.pointerType === 'mouse' || event.button > 0) return
    gesture = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      moved: false,
    }
    try { host.setPointerCapture?.(event.pointerId) } catch {}
  }

  const onPointerMove = event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const total = gesture.startY - event.clientY
    const delta = gesture.lastY - event.clientY
    gesture.lastY = event.clientY
    if (!gesture.moved && Math.abs(total) < 6) return

    gesture.moved = true
    if (delta) reader.scrollTop += delta
    event.preventDefault()
    event.stopPropagation()
  }

  const finishPointer = event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    if (gesture.moved) suppressClickUntil = performance.now() + 400
    try { host.releasePointerCapture?.(event.pointerId) } catch {}
    gesture = null
  }

  const suppressDraggedClick = event => {
    if (performance.now() > suppressClickUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  host.addEventListener('pointerdown', onPointerDown)
  host.addEventListener('pointermove', onPointerMove)
  host.addEventListener('pointerup', finishPointer)
  host.addEventListener('pointercancel', finishPointer)
  host.addEventListener('click', suppressDraggedClick, true)

  return () => {
    host.removeEventListener('pointerdown', onPointerDown)
    host.removeEventListener('pointermove', onPointerMove)
    host.removeEventListener('pointerup', finishPointer)
    host.removeEventListener('pointercancel', finishPointer)
    host.removeEventListener('click', suppressDraggedClick, true)
    host.style.removeProperty('touch-action')
  }
}

function audioAdapter(playback) {
  return {
    mount({ block, host, context }) {
      if (!block.src || !playback) return null

      const label = String(block.label || block.title || 'audio track')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'document-media-hotspot document-audio-hotspot'
      button.style.inset = '0'
      button.dataset.audioSrc = block.src
      button.setAttribute('aria-pressed', 'false')

      const progress = document.createElement('span')
      progress.className = 'sr document-audio-progress'
      progress.id = `document-audio-progress-${++audioControlId}`
      button.setAttribute('aria-describedby', progress.id)

      const live = document.createElement('span')
      live.className = 'sr document-audio-live'
      live.setAttribute('role', 'status')
      live.setAttribute('aria-live', 'polite')
      live.setAttribute('aria-atomic', 'true')

      let previousState = null
      const sync = snapshot => {
        const state = snapshot.state || 'idle'
        button.setAttribute('aria-pressed', snapshot.playing ? 'true' : 'false')
        button.setAttribute('aria-label', `${snapshot.failed ? 'Retry' : snapshot.playing ? 'Pause' : 'Play'} ${label}`)
        progress.textContent = progressDescription(snapshot)

        // The progress description can change frequently, but the live region
        // only announces meaningful playback state transitions.
        if (previousState !== null && state !== previousState) {
          const announcement = liveAnnouncement(state, label)
          if (announcement) live.textContent = announcement
        }
        previousState = state
      }

      const unsubscribe = playback.subscribe(block, sync)
      const removeTouchScroll = installTouchScroll(host, context)
      const activate = event => {
        event.preventDefault()
        event.stopPropagation()
        void playback.toggle(block)
      }
      // Native buttons already map Enter and Space to click, so one handler
      // covers mouse, touch taps and keyboard activation without double toggles.
      button.addEventListener('click', activate)

      host.append(button, progress, live)

      return () => {
        unsubscribe()
        removeTouchScroll()
        button.removeEventListener('click', activate)
        button.remove()
        progress.remove()
        live.remove()
      }
    },
  }
}

export function enhanceAudioBlocks(registry, playback) {
  registry.register('audio', {
    measure(_ctx, block) {
      return { height: clamp(Number(block.height) || 104, 88, 150) }
    },
    paint(ctx, block, layout, env) {
      paintAudio(ctx, block, layout, env, playback)
    },
    getInteraction(block) {
      return {
        provider: 'audio',
        block,
        inline: true,
        direct: true,
      }
    },
  })
  return registry
}

export function registerAudioIntegration(registry, playback) {
  registry.register('audio', audioAdapter(playback))
  return registry
}
