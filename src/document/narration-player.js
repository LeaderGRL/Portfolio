import { formatTime } from './audio-playback-manager.js'
import { installTouchScroll } from './touch-scroll.js'

const NARRATION_HEIGHT = 58
const STICKY_HEIGHT = 44
const STICKY_TOP = 12
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
    this.presentation = null
    this.overlayTopInset = 0

    this.hint = document.getElementById('hint')
    this.baseHint = this.hint?.textContent || ''

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

    this.onWheel = event => {
      event.preventDefault()
      event.stopPropagation()
      const reader = this.rasteriser?.reader
      if (reader) reader.scrollTop += event.deltaY
    }
    this.host.addEventListener('wheel', this.onWheel, { passive: false })

    this.host.append(this.button, this.progress, this.description, this.live)
    this.layer.append(this.host)
    this.tube?.append(this.layer)
    this.removeTouchScroll = installTouchScroll(this.button, { rasteriser: this.rasteriser })
  }

  syncHint() {
    if (!this.hint) return
    const narrationHint = this.item ? ' · N NARRATE' : ''
    const next = `${this.baseHint}${narrationHint}`
    if (this.hint.textContent !== next) this.hint.textContent = next
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
    this.presentation = null
    this.overlayTopInset = 0
    this.live.textContent = ''

    if (this.item && this.playback.hasNarration()) {
      const label = String(this.item.label || this.item.title || this.item.id || 'document')
      this.progress.setAttribute('aria-label', `Narration progress for ${label}`)
      this.button.setAttribute('aria-keyshortcuts', 'N')
      this.host.dataset.narrationFor = String(this.item.id || '')
      this.unsubscribe = this.playback.subscribeNarration((snapshot, meta) => {
        this.snapshot = snapshot
        this.syncControls(snapshot, meta)
        this.rasteriser.markDirty()
        this.onChange(snapshot, meta)
      })
    } else {
      delete this.host.dataset.narrationFor
      delete this.host.dataset.narrationPresentation
      this.button.removeAttribute('aria-keyshortcuts')
      this.layer.hidden = true
    }

    this.syncHint()
    this.reflow()
  }

  reflow() {
    const layout = this.rasteriser?.layout
    if (!Array.isArray(layout)) return

    const existing = layout.find(entry => entry.type === 'narration-header')
    if (existing) {
      this.entry = existing
      this.syncControlGeometry()
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
    this.syncControlGeometry()
    this.rasteriser.markDirty()
  }

  presentationGeometry() {
    if (!this.entry || !this.item) return null

    const top = this.entry.y - this.rasteriser.scroll
    const bottom = top + this.entry.height
    const contentBottom = this.rasteriser.getDocumentContentBottom()
    const primaryVisible = bottom > 0 && top < contentBottom

    if (primaryVisible) {
      return {
        kind: 'primary',
        x: this.entry.x,
        y: top,
        width: this.entry.width,
        height: this.entry.height,
      }
    }

    if (!isActivated(this.snapshot)) return null

    const stickyHeight = Math.max(1, Math.min(STICKY_HEIGHT, contentBottom))
    const stickyTop = Math.max(0, Math.min(STICKY_TOP, contentBottom - stickyHeight))
    return {
      kind: 'sticky',
      x: this.entry.x,
      y: stickyTop,
      width: this.entry.width,
      height: stickyHeight,
    }
  }

  controlMetrics(geometry, activated = isActivated(this.snapshot)) {
    const width = Math.max(1, Number(geometry?.width) || 1)
    const height = Math.max(1, Number(geometry?.height) || NARRATION_HEIGHT)
    const responsiveCompact = document.body.classList.contains('is-compact-stage') ||
      document.body.classList.contains('is-landscape-mobile-stage')
    const compact = geometry?.kind === 'sticky' || responsiveCompact || width < 420
    const buttonWidth = Math.min(activated ? (compact ? 62 : 70) : 126, width)
    const buttonHeight = Math.min(compact ? 26 : 28, height)
    const buttonTop = Math.min(compact ? 5 : 4, Math.max(0, height - buttonHeight))
    const progressLeft = Math.min(compact ? 74 : 84, width)
    const progressHeight = Math.min(compact ? 20 : 22, height)
    const progressTop = Math.min(compact ? 16 : 19, Math.max(0, height - progressHeight))

    return {
      compact,
      buttonWidth,
      buttonHeight,
      buttonTop,
      progressLeft,
      progressTop,
      progressHeight,
    }
  }

  syncControlGeometry(activated = isActivated(this.snapshot), geometry = this.presentationGeometry()) {
    if (!geometry) return
    const width = Math.max(1, Number(geometry.width) || 1)
    const height = Math.max(1, Number(geometry.height) || NARRATION_HEIGHT)
    const xPercent = value => `${(clamp(value, 0, width) / width) * 100}%`
    const yPercent = value => `${(clamp(value, 0, height) / height) * 100}%`
    const metrics = this.controlMetrics(geometry, activated)

    this.button.style.left = '0'
    this.button.style.top = yPercent(metrics.buttonTop)
    this.button.style.width = xPercent(metrics.buttonWidth)
    this.button.style.height = yPercent(metrics.buttonHeight)

    this.progress.style.left = xPercent(metrics.progressLeft)
    this.progress.style.right = 'auto'
    this.progress.style.top = yPercent(metrics.progressTop)
    this.progress.style.width = xPercent(Math.max(0, width - metrics.progressLeft))
    this.progress.style.height = yPercent(metrics.progressHeight)
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
    this.syncControlGeometry(activated)
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
      delete this.host.dataset.narrationPresentation
      this.presentation = null
      this.overlayTopInset = 0
      return
    }

    const geometry = this.presentationGeometry()
    if (!geometry) {
      this.layer.hidden = true
      delete this.host.dataset.narrationPresentation
      this.presentation = null
      this.overlayTopInset = 0
      return
    }

    const width = this.rasteriser.width
    const height = this.rasteriser.height
    this.layer.hidden = false
    this.presentation = geometry.kind
    this.overlayTopInset = geometry.kind === 'sticky' ? geometry.y + geometry.height : 0
    this.host.dataset.narrationPresentation = geometry.kind
    this.host.classList.toggle('is-sticky', geometry.kind === 'sticky')
    this.host.style.left = `${(geometry.x / width) * 100}%`
    this.host.style.top = `${(geometry.y / height) * 100}%`
    this.host.style.width = `${(geometry.width / width) * 100}%`
    this.host.style.height = `${(geometry.height / height) * 100}%`
    this.syncControlGeometry(isActivated(this.snapshot), geometry)

    const contentBottom = this.rasteriser.getDocumentContentBottom()
    const clippedBottom = Math.max(0, Math.min(height, contentBottom))
    const inset = Math.max(0, height - clippedBottom)
    this.layer.style.clipPath = `inset(0 0 ${((inset / height) * 100).toFixed(6)}% 0)`
  }

  paint() {
    if (!this.item || !this.entry || !this.snapshot) return
    const geometry = this.presentationGeometry()
    if (!geometry) return

    const ctx = this.rasteriser.ctx
    const colors = this.rasteriser._blockEnv().colors
    const snapshot = this.snapshot
    const activated = isActivated(snapshot)
    const failed = Boolean(snapshot.failed)
    const playing = Boolean(snapshot.playing)
    const current = Number(snapshot.currentTime) || 0
    const duration = Number(snapshot.duration) || 0
    const progress = duration > 0 ? clamp(current / duration, 0, 1) : 0
    const x = geometry.x
    const y = geometry.y
    const width = geometry.width
    const metrics = this.controlMetrics(geometry, activated)
    const contentBottom = this.rasteriser.getDocumentContentBottom()
    const clipTop = geometry.kind === 'sticky' ? 0 : 20

    ctx.save()
    ctx.setTransform(
      this.rasteriser.canvas.width / this.rasteriser.width,
      0,
      0,
      this.rasteriser.canvas.height / this.rasteriser.height,
      0,
      0,
    )
    ctx.beginPath()
    ctx.rect(
      Math.max(8, this.rasteriser.columnX - 16),
      clipTop,
      this.rasteriser.columnWidth + 32,
      Math.max(0, contentBottom - clipTop),
    )
    ctx.clip()

    if (geometry.kind === 'sticky') {
      ctx.fillStyle = 'rgba(3,16,9,.94)'
      ctx.fillRect(x - 4, y, width + 8, geometry.height)
      ctx.strokeStyle = colors.dim
      ctx.strokeRect(x - 3.5, y + .5, width + 7, Math.max(0, geometry.height - 1))
    }

    ctx.font = '700 9px ui-monospace, "SFMono-Regular", Consolas, monospace'
    ctx.textBaseline = 'alphabetic'

    if (!activated) {
      const buttonW = metrics.buttonWidth
      const buttonH = metrics.buttonHeight
      const buttonY = y + metrics.buttonTop
      ctx.fillStyle = 'rgba(47,208,109,.055)'
      ctx.fillRect(x, buttonY, buttonW, buttonH)
      ctx.strokeStyle = colors.dim
      ctx.strokeRect(x + .5, buttonY + .5, buttonW - 1, buttonH - 1)
      ctx.fillStyle = colors.amber
      ctx.fillText('▶ NARRATE', x + 10, buttonY + 18)
      ctx.restore()
      return
    }

    const buttonW = metrics.buttonWidth
    const buttonH = metrics.buttonHeight
    const buttonY = y + metrics.buttonTop
    ctx.fillStyle = 'rgba(47,208,109,.055)'
    ctx.fillRect(x, buttonY, buttonW, buttonH)
    ctx.strokeStyle = failed ? colors.amber : colors.dim
    ctx.strokeRect(x + .5, buttonY + .5, buttonW - 1, buttonH - 1)
    ctx.fillStyle = failed ? colors.amber : playing ? colors.core : colors.amber
    ctx.fillText(failed ? '↻ RETRY' : playing ? '❚❚ PAUSE' : '▶ PLAY', x + (metrics.compact ? 6 : 9), buttonY + 18)

    if (failed) {
      ctx.fillStyle = colors.amber
      ctx.fillText('NARRATION UNAVAILABLE', x + metrics.progressLeft, buttonY + 18)
      ctx.restore()
      return
    }

    const timeX = x + metrics.progressLeft
    ctx.fillStyle = colors.mid
    ctx.font = '600 7px ui-monospace, "SFMono-Regular", Consolas, monospace'
    ctx.fillText(formatTime(current), timeX, y + (metrics.compact ? 13 : 15))
    ctx.textAlign = 'right'
    ctx.fillText(duration > 0 ? formatTime(duration) : '--:--', x + width, y + (metrics.compact ? 13 : 15))
    ctx.textAlign = 'left'

    const barY = y + (metrics.compact ? 24 : 26)
    const barW = Math.max(0, width - metrics.progressLeft)
    ctx.fillStyle = 'rgba(47,208,109,.14)'
    ctx.fillRect(timeX, barY, barW, 5)
    ctx.fillStyle = colors.mid
    ctx.fillRect(timeX, barY, barW * progress, 5)
    ctx.restore()
  }

  destroy() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.host.removeEventListener('wheel', this.onWheel)
    this.removeTouchScroll?.()
    this.layer.remove()
    if (this.hint && this.hint.textContent !== this.baseHint) this.hint.textContent = this.baseHint
    this.item = null
    this.entry = null
    this.presentation = null
    this.overlayTopInset = 0
  }
}

export { NARRATION_HEIGHT }
