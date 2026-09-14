import { formatTime } from './audio-playback-manager.js'
import { installTouchScroll } from './touch-scroll.js'

const NARRATION_HEIGHT = 58
let narrationControlId = 0

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function isActivated(snapshot = {}) {
  return Boolean(snapshot.activated || snapshot.state === 'playing' || snapshot.state === 'paused' || snapshot.state === 'error')
}

function rangeValueText(snapshot) {
  const current = Number(snapshot.currentTime) || 0
  const duration = Number(snapshot.duration) || 0
  return duration > 0
    ? `${formatTime(current)} of ${formatTime(duration)}`
    : `${formatTime(current)} elapsed; duration unavailable`
}

function liveAnnouncement(snapshot, label, reason) {
  if (reason === 'ended') return `Narration for ${label} finished.`
  if (snapshot.state === 'playing') return `Playing narration for ${label}.`
  if (snapshot.state === 'paused') return `Paused narration for ${label}.`
  if (snapshot.state === 'error') return `Narration unavailable for ${label}.`
  return ''
}

export class NarrationPlayer {
  constructor({ tube, rasteriser, playback, onChange = () => {} }) {
    this.tube = tube
    this.rasteriser = rasteriser
    this.playback = playback
    this.onChange = onChange
    this.item = null
    this.entry = null
    this.snapshot = null
    this.unsubscribe = null

    this.layer = document.createElement('div')
    this.layer.className = 'document-narration-layer raster-layer'
    this.layer.setAttribute('role', 'group')
    this.layer.setAttribute('aria-label', 'Document narration controls')
    this.layer.hidden = true

    this.host = document.createElement('div')
    this.host.className = 'document-narration-controls'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'document-narration-toggle'
    this.button.dataset.narrationControl = 'toggle'
    this.button.setAttribute('aria-pressed', 'false')

    this.progress = document.createElement('input')
    this.progress.type = 'range'
    this.progress.className = 'document-narration-progress'
    this.progress.dataset.narrationControl = 'progress'
    this.progress.min = '0'
    this.progress.step = '0.1'

    this.description = document.createElement('span')
    this.description.className = 'sr document-narration-description'
    this.description.id = `document-narration-description-${++narrationControlId}`
    this.progress.setAttribute('aria-describedby', this.description.id)

    this.live = document.createElement('span')
    this.live.className = 'sr document-narration-live'
    this.live.setAttribute('role', 'status')
    this.live.setAttribute('aria-live', 'polite')
    this.live.setAttribute('aria-atomic', 'true')

    this.previousState = null
    this.button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      void this.playback.toggleNarration()
    })
    const seek = event => {
      event.stopPropagation()
      this.playback.seekNarration(Number(this.progress.value))
    }
    this.progress.addEventListener('input', seek)
    this.progress.addEventListener('change', seek)

    this.host.append(this.button, this.progress, this.description, this.live)
    this.layer.append(this.host)
    this.tube?.append(this.layer)
    this.removeTouchScroll = installTouchScroll(this.button, { rasteriser: this.rasteriser })
  }

  setDocument(item) {
    const nextKey = item?.narration ? `${item.id || ''}:${item.narration}` : ''
    const currentKey = this.item?.narration ? `${this.item.id || ''}:${this.item.narration}` : ''
    if (nextKey === currentKey && this.item === item) return

    this.unsubscribe?.()
    this.unsubscribe = null
    this.item = item?.narration ? item : null
    this.snapshot = null
    this.previousState = null

    if (this.item && this.playback.hasNarration()) {
      const label = String(this.item.label || this.item.title || this.item.id || 'document')
      this.progress.setAttribute('aria-label', `Narration progress for ${label}`)
      this.host.dataset.narrationFor = String(this.item.id || '')
      this.unsubscribe = this.playback.subscribeNarration((snapshot, meta) => {
        this.snapshot = snapshot
        this.syncControls(snapshot, meta)
        this.rasteriser.markDirty()
        this.onChange(snapshot, meta)
      })
    } else {
      delete this.host.dataset.narrationFor
      this.layer.hidden = true
    }

    this.reflow()
  }

  reflow() {
    const layout = this.rasteriser?.layout
    if (!Array.isArray(layout)) return

    const existing = layout.find(entry => entry.type === 'narration-header')
    if (existing) {
      this.entry = existing
      return
    }

    this.entry = null
    if (!this.item) return

    const ruleIndex = layout.findIndex(entry => entry.type === 'rule')
    if (ruleIndex < 0) return

    const rule = layout[ruleIndex]
    const entry = {
      type: 'narration-header',
      x: rule.x,
      y: rule.y,
      width: rule.width,
      height: NARRATION_HEIGHT,
    }
    for (let index = ruleIndex; index < layout.length; index++) layout[index].y += NARRATION_HEIGHT
    layout.splice(ruleIndex, 0, entry)
    this.entry = entry

    this.rasteriser.contentHeight = (this.rasteriser.contentHeight || 0) + NARRATION_HEIGHT
    this.rasteriser.documentHeight = (this.rasteriser.documentHeight || 0) + NARRATION_HEIGHT
    this.rasteriser.maxScroll = Math.max(
      0,
      this.rasteriser.contentHeight - this.rasteriser.getDocumentContentBottom(),
    )
    this.rasteriser.markDirty()
  }

  syncControls(snapshot = {}, meta = {}) {
    if (!this.item) return
    const label = String(this.item.label || this.item.title || this.item.id || 'document')
    const activated = isActivated(snapshot)
    const failed = Boolean(snapshot.failed)
    const playing = Boolean(snapshot.playing)
    const duration = Number(snapshot.duration) || 0
    const current = Number(snapshot.currentTime) || 0
    const state = String(snapshot.state || 'idle')

    this.host.classList.toggle('is-activated', activated)
    this.host.classList.toggle('is-error', failed)
    this.button.setAttribute('aria-pressed', playing ? 'true' : 'false')
    this.button.setAttribute(
      'aria-label',
      `${failed ? 'Retry' : playing ? 'Pause' : 'Play'} narration for ${label}`,
    )

    this.progress.hidden = !activated || failed
    this.progress.disabled = failed || duration <= 0
    this.progress.max = String(Math.max(duration, current, 1))
    this.progress.value = String(clamp(current, 0, Math.max(duration, current, 1)))
    this.progress.setAttribute('aria-valuetext', rangeValueText(snapshot))
    this.description.textContent = failed
      ? `Narration unavailable for ${label}. Activate retry to try again.`
      : `Narration for ${label}: ${rangeValueText(snapshot)}.`

    if (this.previousState !== null && (state !== this.previousState || meta.reason === 'ended')) {
      const announcement = liveAnnouncement(snapshot, label, meta.reason)
      if (announcement) this.live.textContent = announcement
    }
    this.previousState = state
  }

  sync() {
    const active = Boolean(
      this.item &&
      this.entry &&
      this.tube?.dataset.displayMode === 'article' &&
      !this.tube?.classList.contains('is-powered-off'),
    )
    if (!active) {
      this.layer.hidden = true
      return
    }

    const top = this.entry.y - this.rasteriser.scroll
    const bottom = top + this.entry.height
    const contentBottom = this.rasteriser.getDocumentContentBottom()
    const visible = bottom > 0 && top < contentBottom
    this.layer.hidden = !visible
    if (!visible) return

    const width = this.rasteriser.width
    const height = this.rasteriser.height
    this.host.style.left = `${(this.entry.x / width) * 100}%`
    this.host.style.top = `${(top / height) * 100}%`
    this.host.style.width = `${(this.entry.width / width) * 100}%`
    this.host.style.height = `${(this.entry.height / height) * 100}%`

    const clippedBottom = Math.max(0, Math.min(height, contentBottom))
    const inset = Math.max(0, height - clippedBottom)
    this.layer.style.clipPath = `inset(0 0 ${((inset / height) * 100).toFixed(6)}% 0)`
  }

  paint() {
    if (!this.item || !this.entry || !this.snapshot) return
    const y = this.entry.y - this.rasteriser.scroll
    const contentBottom = this.rasteriser.getDocumentContentBottom()
    if (y + this.entry.height < 14 || y > contentBottom) return

    const ctx = this.rasteriser.ctx
    const colors = this.rasteriser._blockEnv().colors
    const snapshot = this.snapshot
    const activated = isActivated(snapshot)
    const failed = Boolean(snapshot.failed)
    const playing = Boolean(snapshot.playing)
    const current = Number(snapshot.currentTime) || 0
    const duration = Number(snapshot.duration) || 0
    const progress = duration > 0 ? clamp(current / duration, 0, 1) : 0
    const x = this.entry.x
    const width = this.entry.width

    ctx.save()
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
      ctx.restore()
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
      ctx.restore()
      return
    }

    const timeX = x + Math.min(84, width)
    ctx.fillStyle = colors.mid
    ctx.font = '600 7px ui-monospace, "SFMono-Regular", Consolas, monospace'
    ctx.fillText(formatTime(current), timeX, y + 15)
    ctx.textAlign = 'right'
    ctx.fillText(duration > 0 ? formatTime(duration) : '--:--', x + width, y + 15)
    ctx.textAlign = 'left'

    const barY = y + 26
    const barW = Math.max(0, width - (timeX - x))
    ctx.fillStyle = 'rgba(47,208,109,.14)'
    ctx.fillRect(timeX, barY, barW, 5)
    ctx.fillStyle = colors.mid
    ctx.fillRect(timeX, barY, barW * progress, 5)
    ctx.restore()
  }

  destroy() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.removeTouchScroll?.()
    this.layer.remove()
    this.item = null
    this.entry = null
  }
}

export { NARRATION_HEIGHT }
