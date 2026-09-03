const ACTIVE_AUDIO = new Set()

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const rest = Math.floor(safe % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function panelVolume() {
  const value = Number(document.getElementById('volume')?.getAttribute('aria-valuenow'))
  return Number.isFinite(value) ? clamp(value / 100, 0, 1) : 0.35
}

function stopOtherAudio(current) {
  for (const audio of ACTIVE_AUDIO) {
    if (audio !== current && !audio.paused) audio.pause()
  }
}

function paintAudio(ctx, block, layout, env) {
  const { colors } = env
  const x = layout.x
  const y = layout.y
  const width = layout.width
  const height = layout.height - 10
  const audio = block.__audioElement || null
  const playing = Boolean(audio && !audio.paused && !audio.ended)
  const duration = Number(audio?.duration) || 0
  const current = Number(audio?.currentTime) || 0
  const progress = duration > 0 ? clamp(current / duration, 0, 1) : 0
  const title = String(block.label || block.title || 'AUDIO TRACK').toUpperCase()
  const credit = String(block.credit || '').toUpperCase()

  ctx.fillStyle = colors.panel
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = colors.dim
  ctx.strokeRect(x + .5, y + .5, width - 1, height - 1)

  ctx.fillStyle = playing ? colors.core : colors.amber
  ctx.font = '700 10px ui-monospace, "SFMono-Regular", Consolas, monospace'
  ctx.fillText(playing ? '❚❚ PAUSE' : '▶ PLAY', x + 12, y + 24)

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
  ctx.fillStyle = colors.mid
  ctx.fillRect(barX, barY, barW * progress, 5)

  ctx.fillStyle = colors.dim
  ctx.font = '600 7px ui-monospace, "SFMono-Regular", Consolas, monospace'
  ctx.fillText(`${formatTime(current)} / ${duration ? formatTime(duration) : '--:--'}`, barX, barY + 19)
  ctx.textAlign = 'right'
  ctx.fillText('CLICK TO PLAY / PAUSE', x + width - 12, barY + 19)
  ctx.textAlign = 'left'
}

function audioAdapter() {
  return {
    mount({ block, host, context }) {
      if (!block.src) return null

      const rasteriser = context?.rasteriser
      const audio = new Audio()
      audio.src = block.src
      audio.preload = 'metadata'
      audio.volume = panelVolume()
      block.__audioElement = audio
      ACTIVE_AUDIO.add(audio)

      const markDirty = () => rasteriser?.markDirty?.()
      const syncVolume = () => { audio.volume = panelVolume() }
      const events = ['loadedmetadata', 'play', 'pause', 'ended', 'timeupdate', 'seeked']
      events.forEach(name => audio.addEventListener(name, markDirty, { passive: true }))

      const volumeControl = document.getElementById('volume')
      const volumeObserver = volumeControl ? new MutationObserver(syncVolume) : null
      volumeObserver?.observe(volumeControl, { attributes: true, attributeFilter: ['aria-valuenow'] })

      const pauseWhenHidden = () => {
        if (document.hidden && !audio.paused) audio.pause()
      }
      document.addEventListener('visibilitychange', pauseWhenHidden)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'document-media-hotspot document-audio-hotspot'
      button.style.inset = '0'
      button.setAttribute('aria-label', `Play or pause ${block.label || block.title || 'audio track'}`)

      const toggle = async () => {
        if (audio.paused || audio.ended) {
          stopOtherAudio(audio)
          syncVolume()
          try { await audio.play() } catch {}
        } else {
          audio.pause()
        }
        markDirty()
      }

      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        toggle()
      })
      button.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        toggle()
      })
      host.append(button)

      return () => {
        volumeObserver?.disconnect()
        document.removeEventListener('visibilitychange', pauseWhenHidden)
        events.forEach(name => audio.removeEventListener(name, markDirty))
        audio.pause()
        audio.removeAttribute('src')
        try { audio.load() } catch {}
        ACTIVE_AUDIO.delete(audio)
        if (block.__audioElement === audio) delete block.__audioElement
        button.remove()
        markDirty()
      }
    },
  }
}

export function enhanceAudioBlocks(registry) {
  registry.register('audio', {
    measure(_ctx, block) {
      return { height: clamp(Number(block.height) || 104, 88, 150) }
    },
    paint(ctx, block, layout, env) {
      paintAudio(ctx, block, layout, env)
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

export function registerAudioIntegration(registry) {
  registry.register('audio', audioAdapter())
  return registry
}
