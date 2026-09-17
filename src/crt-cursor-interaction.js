import { foley } from './audio.js'
import {
  CRT_CURSOR_ACTIVATE_EVENT,
  closestInteractive,
  screenListingIndexAt,
} from './runtime-controls.js'

const ACTIVE = 'CRT_ACTIVE'
const ABSORBING = 'ABSORBING'
const CLICK_DURATION_MS = 110
const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep01 = value => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}
const mixAngle = (from, to, amount) => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * clamp01(amount)
}

function semanticAction(target) {
  const element = closestInteractive(target)
  if (!element || element.tagName === 'IFRAME') return null
  if (element.disabled || element.getAttribute?.('aria-disabled') === 'true') return null
  return { kind: 'semantic', element }
}

export class CrtCursorInteractionController {
  constructor(app, controller, {
    audio = foley,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
  } = {}) {
    this.app = app
    this.controller = controller
    this.audio = audio
    this.document = documentRef
    this.window = windowRef
    this.tube = controller?.tube || this.document?.getElementById?.('tube') || null
    this.action = null
    this.lock = 0
    this.lockAngle = null
    this.lastFrameMs = null
    this.signature = ''
    this.activation = null
    this.activationCount = 0
    this.installed = false

    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.handleClick = this.handleClick.bind(this)
    this.handleRasterActivation = this.handleRasterActivation.bind(this)
  }

  install() {
    if (this.installed || !this.controller) return this
    this.installed = true
    this.baseFrame = this.controller.frame.bind(this.controller)
    this.frameWrapper = ms => this.frame(ms)
    this.controller.frame = this.frameWrapper
    this.window?.addEventListener?.('pointermove', this.handlePointerMove, { passive: true, capture: true })
    this.document?.addEventListener?.('click', this.handleClick, true)
    this.tube?.addEventListener?.(CRT_CURSOR_ACTIVATE_EVENT, this.handleRasterActivation)
    this._probe()
    return this
  }

  destroy() {
    if (!this.installed) return
    this.window?.removeEventListener?.('pointermove', this.handlePointerMove, true)
    this.document?.removeEventListener?.('click', this.handleClick, true)
    this.tube?.removeEventListener?.(CRT_CURSOR_ACTIVATE_EVENT, this.handleRasterActivation)
    if (this.controller?.frame === this.frameWrapper) this.controller.frame = this.baseFrame
    this.installed = false
  }

  _actionAt(target, x, y) {
    const semantic = semanticAction(target)
    if (semantic) return semantic
    const index = screenListingIndexAt(this.app, x, y, this.document)
    return index >= 0 ? { kind: 'listing', index } : null
  }

  _setAction(action) {
    if (action && !this.action) this.lockAngle = this.controller?.motion?.angle ?? 0
    this.action = action
  }

  _probe() {
    const motion = this.controller?.motion
    if (motion?.timeMs == null) return
    const target = this.document?.elementFromPoint?.(motion.x, motion.y) || null
    this._setAction(this._actionAt(target, motion.x, motion.y))
  }

  _contentSignature() {
    const state = this.app?.state || {}
    const item = state.item
    const itemKey = typeof item === 'object' ? item?.id || item?.label || '' : item || ''
    return `${state.route || ''}|${itemKey}|${state.fullscreen ? 1 : 0}`
  }

  handlePointerMove(event) {
    const edge = this.controller?.edge
    if (!edge?.inside && this.controller?.state !== ACTIVE) {
      this._setAction(null)
      return
    }
    this._setAction(this._actionAt(event?.target, event?.clientX, event?.clientY))
  }

  handleClick(event) {
    if (!(event?.detail > 0) || this.controller?.state !== ACTIVE) return
    const action = this._actionAt(event.target, event.clientX, event.clientY)
    if (action?.kind !== 'semantic') return
    this._setAction(action)
    this._activate(event.timeStamp)
  }

  handleRasterActivation(event) {
    if (this.controller?.state !== ACTIVE) return
    this._setAction({ kind: event?.detail?.kind || 'listing', index: event?.detail?.index })
    this._activate(event.timeStamp)
  }

  _activate(timeStamp) {
    const timeMs = Number.isFinite(timeStamp) ? timeStamp : this.lastFrameMs ?? 0
    this.activation = {
      startedAtMs: timeMs,
      placement: this.controller?._placement?.() || null,
    }
    this.activationCount += 1
    this.audio?.ensure?.()
    this.audio?.cursorClick?.()
  }

  _clickStrength(ms) {
    if (!this.activation) return 0
    const elapsed = Math.max(0, ms - this.activation.startedAtMs)
    return 1 - smoothstep01(elapsed / CLICK_DURATION_MS)
  }

  _tickLock(ms, active) {
    const dt = this.lastFrameMs == null ? 16.67 : Math.max(0, Math.min(50, ms - this.lastFrameMs))
    this.lastFrameMs = ms
    const target = active && this.action ? 1 : 0
    const responseMs = target ? 55 : 90
    this.lock += (target - this.lock) * (1 - Math.exp(-dt / responseMs))

    if (target) {
      const angle = this.controller.motion.angle
      if (this.lockAngle == null) this.lockAngle = angle
      this.lockAngle = mixAngle(this.lockAngle, angle, 1 - Math.exp(-dt / 180))
    }
  }

  _applyVisual(ms) {
    if (this.controller?.state !== ACTIVE) {
      this.activation = null
      return
    }

    const click = this._clickStrength(ms)
    const state = this.app?.crt?.getCursorState?.() || this.app?.crt?.cursorState
    if (state?.visible) {
      this.app.crt.setCursorState({
        compression: clamp01((state.compression || 0) + this.lock * 0.055 + click * 0.075),
        hoverIntensity: this.lock * 0.48,
        clickImpulse: click * 0.52,
      })
      return
    }

    const last = this.controller?.view?.last
    if (!last) return
    this.controller.view.update({
      ...last,
      phosphor: clamp01(last.phosphor + this.lock * 0.10 + click * 0.12),
      compression: clamp01(last.compression + this.lock * 0.055 + click * 0.085),
    })
  }

  _applyReaction(ms) {
    if (!this.activation || this.controller?.state !== ACTIVE) return
    const click = this._clickStrength(ms)
    if (click <= 0.0001) {
      this.activation = null
      return
    }

    const placement = this.activation.placement || this.controller?._placement?.()
    if (!placement || !this.controller?._applyReaction) return
    const base = this.app?.crt?.getReactionState?.() || this.app?.crt?.reactionState || {}
    this.controller._applyReaction(placement, {
      strength: clamp01((base.active ? base.strength : 0) + click * 0.14),
      submergedStrength: clamp01((base.active ? base.submergedStrength : 0) + click * 0.08),
      recoilStrength: Math.max(-1, Math.min(1, (base.active ? base.recoilStrength : 0) + click * 0.04)),
    }, 'interaction')
  }

  _syncDataset(ms) {
    if (!this.tube?.dataset) return
    const locked = this.controller?.state === ACTIVE && Boolean(this.action)
    this.tube.dataset.crtCursorInteractive = locked ? 'locked' : 'idle'
    this.tube.dataset.crtCursorInteractiveTarget = locked ? this.action.kind : 'none'
    this.tube.dataset.crtCursorInteractiveStrength = this.lock.toFixed(4)
    this.tube.dataset.crtCursorClickImpulse = this._clickStrength(ms).toFixed(4)
    this.tube.dataset.crtCursorActivationCount = String(this.activationCount)
  }

  frame(ms) {
    if (!Number.isFinite(ms)) return this.baseFrame(ms)
    const controller = this.controller
    const previousState = controller.state
    const signature = this._contentSignature()
    if (signature !== this.signature) {
      this.signature = signature
      this._probe()
    }

    const activeBeforeFrame = previousState === ACTIVE
    this._tickLock(ms, activeBeforeFrame)
    const rawAngle = controller.motion.angle
    if (activeBeforeFrame && this.lock > 0.001) {
      controller.motion.angle = mixAngle(rawAngle, this.lockAngle ?? rawAngle, this.lock * 0.58)
    }

    try {
      this.baseFrame(ms)
    } finally {
      controller.motion.angle = rawAngle
    }

    if (previousState === ABSORBING
      && controller.state === ACTIVE
      && !controller.reducedMotionQuery?.matches) {
      this.audio?.cursorSnap?.()
    }

    this._applyVisual(ms)
    this._applyReaction(ms)
    this._syncDataset(ms)
  }
}

export function installCrtCursorInteraction(app, controller, options) {
  return new CrtCursorInteractionController(app, controller, options).install()
}
