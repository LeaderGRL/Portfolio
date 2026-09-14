import { formatTime } from './audio-playback-manager.js'
import { installTouchScroll } from './touch-scroll.js'

let narrationControlId = 0

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function narrationLabel(block) {
  return String(block?.label || block?.title || 'document')
}

function isActivated(snapshot = {}) {
  return Boolean(snapshot.activated || snapshot.state === 'playing' || snapshot.state === 'paused' || snapshot.state === 'error')
}

export function paintNarration(ctx, layout, env, playback) {
  const { colors } = env
  const snapshot = playback?.snapshotNarration?.() || {}
  const activated = isActivated(snapshot)
  const failed = Boolean(snapshot.failed)
  const playing = Boolean(snapshot.playing)
  const current = Number(snapshot.currentTime) || 0
  const duration = Number(snapshot.duration) || 0
  const progress = duration > 0 ? clamp(current / duration, 0, 1) : 0
  const { x, y, width } = layout

  ctx.font = '700 9px ui-monospace, "SFMono-Regular", Consolas, monospace'
  ctx.textBaseline = 'alphabetic'

  if (!activated) {
    const buttonW = Math.min(126, width)
    const buttonH = 28
    ctx.fillStyle = 'rgba(47,208,109,.055)'
    ctx.fillRect(x, y + 4, buttonW, buttonH)
    ctx.strokeStyle = colors.dim
    ctx.strokeRect(x + .5, y + 4.5, buttonW - 1, buttonH - 1)
    ctx.fillStyle = colors.amber
    ctx.fillText('▶ NARRATE', x + 10, y + 22)
    return
  }

  const buttonW = Math.min(70, width)
  const buttonH = 28
  ctx.fillStyle = 'rgba(47,208,109,.055)'
  ctx.fillRect(x, y + 4, buttonW, buttonH)
  ctx.strokeStyle = failed ? colors.amber : colors.dim
  ctx.strokeRect(x + .5, y + 4.5, buttonW - 1, buttonH - 1)
  ctx.fillStyle = failed ? colors.amber : playing ? colors.core : colors.amber
  ctx.fillText(failed ? '↻ RETRY' : playing ? '❚❚ PAUSE' : '▶ PLAY', x + 9, y + 22)

  if (failed) {
    ctx.fillStyle = colors.amber
    ctx.fillText('NARRATION UNAVAILABLE', x + Math.min(84, width), y + 22)
    return
  }

  const timeX = x + Math.min(84, width)
  const timeRight = x + width
  ctx.fillStyle = colors.mid
  ctx.font = '600 7px ui-monospace, "SFMono-Regular", Consolas, monospace'
  ctx.fillText(formatTime(current), timeX, y + 15)
  ctx.textAlign = 'right'
  ctx.fillText(duration > 0 ? formatTime(duration) : '--:--', timeRight, y + 15)
  ctx.textAlign = 'left'

  const barX = timeX
  const barY = y + 26
  const barW = Math.max(0, width - (timeX - x))
  ctx.fillStyle = 'rgba(47,208,109,.14)'
  ctx.fillRect(barX, barY, barW, 5)
  ctx.fillStyle = colors.mid
  ctx.fillRect(barX, barY, barW * progress, 5)
}

function liveAnnouncement(snapshot, label, reason) {
  if (reason === 'ended') return `Narration for ${label} finished.`
  if (snapshot.state === 'playing') return `Playing narration for ${label}.`
  if (snapshot.state === 'paused') return `Paused narration for ${label}.`
  if (snapshot.state === 'error') return `Narration unavailable for ${label}.`
  return ''
}

function rangeValueText(snapshot) {
  const current = Number(snapshot.currentTime) || 0
  const duration = Number(snapshot.duration) || 0
  return duration > 0
    ? `${formatTime(current)} of ${formatTime(duration)}`
    : `${formatTime(current)} elapsed; duration unavailable`
}

function narrationAdapter(playback) {
  return {
    mount({ block, host, context }) {
      if (!playback?.hasNarration?.()) return null

      const label = narrationLabel(block)
      host.classList.add('document-narration-controls')
      host.style.pointerEvents = 'none'

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'document-narration-toggle'
      button.dataset.narrationControl = 'toggle'
      button.setAttribute('aria-pressed', 'false')

      const progress = document.createElement('input')
      progress.type = 'range'
      progress.className = 'document-narration-progress'
      progress.dataset.narrationControl = 'progress'
      progress.min = '0'
      progress.step = '0.1'
      progress.setAttribute('aria-label', `Narration progress for ${label}`)

      const description = document.createElement('span')
      description.className = 'sr document-narration-description'
      description.id = `document-narration-description-${++narrationControlId}`
      progress.setAttribute('aria-describedby', description.id)

      const live = document.createElement('span')
      live.className = 'sr document-narration-live'
      live.setAttribute('role', 'status')
      live.setAttribute('aria-live', 'polite')
      live.setAttribute('aria-atomic', 'true')

      let previousState = null
      const sync = (snapshot = {}, meta = {}) => {
        const activated = isActivated(snapshot)
        const failed = Boolean(snapshot.failed)
        const playing = Boolean(snapshot.playing)
        const duration = Number(snapshot.duration) || 0
        const current = Number(snapshot.currentTime) || 0
        const state = String(snapshot.state || 'idle')

        host.classList.toggle('is-activated', activated)
        host.classList.toggle('is-error', failed)
        button.setAttribute('aria-pressed', playing ? 'true' : 'false')
        button.setAttribute(
          'aria-label',
          `${failed ? 'Retry' : playing ? 'Pause' : 'Play'} narration for ${label}`,
        )

        progress.hidden = !activated || failed
        progress.disabled = failed || duration <= 0
        progress.max = String(Math.max(duration, current, 1))
        progress.value = String(clamp(current, 0, Math.max(duration, current, 1)))
        progress.setAttribute('aria-valuetext', rangeValueText(snapshot))
        description.textContent = failed
          ? `Narration unavailable for ${label}. Activate retry to try again.`
          : `Narration for ${label}: ${rangeValueText(snapshot)}.`

        if (previousState !== null && (state !== previousState || meta.reason === 'ended')) {
          const announcement = liveAnnouncement(snapshot, label, meta.reason)
          if (announcement) live.textContent = announcement
        }
        previousState = state
      }

      const unsubscribe = playback.subscribeNarration(sync)
      const removeTouchScroll = installTouchScroll(button, context)
      const activate = event => {
        event.preventDefault()
        event.stopPropagation()
        void playback.toggleNarration()
      }
      const seek = event => {
        event.stopPropagation()
        playback.seekNarration(Number(progress.value))
      }

      button.addEventListener('click', activate)
      progress.addEventListener('input', seek)
      progress.addEventListener('change', seek)
      host.append(button, progress, description, live)

      return () => {
        unsubscribe()
        removeTouchScroll()
        button.removeEventListener('click', activate)
        progress.removeEventListener('input', seek)
        progress.removeEventListener('change', seek)
        button.remove()
        progress.remove()
        description.remove()
        live.remove()
        host.classList.remove('document-narration-controls', 'is-activated', 'is-error')
      }
    },
  }
}

export function registerNarrationIntegration(registry, playback) {
  registry.register('narration', narrationAdapter(playback))
  return registry
}
