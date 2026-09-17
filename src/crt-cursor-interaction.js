import { foley } from './audio.js'
import { closestInteractive, screenListingIndexAt } from './runtime-controls.js'

const ACTIVE = 'CRT_ACTIVE'
const ABSORBING = 'ABSORBING'

export function installCrtCursorInteraction(app, controller) {
  const tube = controller?.tube
  if (!tube) return
  let action = null
  let lockAngle = 0
  let pointerId = null
  let press = null
  let activation = null

  const hit = (target, x, y) => {
    const element = closestInteractive(target)
    if (element && element.tagName !== 'IFRAME'
      && !element.disabled && element.getAttribute?.('aria-disabled') !== 'true') return element
    const index = screenListingIndexAt(app, x, y)
    return index < 0 ? null : index + 1
  }
  const owns = event => controller.state === ACTIVE
    && event.isPrimary && event.button === 0
    && event.pointerType !== 'touch'
    && event.pointerType === controller.pointerType
    && (pointerId == null || event.pointerId === pointerId)

  addEventListener('pointermove', event => {
    if (event.pointerType === controller.pointerType) pointerId = event.pointerId
  }, { passive: true, capture: true })
  document.addEventListener('pointerdown', event => {
    if (!owns(event)) return
    pointerId = event.pointerId
    press = [event.pointerId, event.clientX, event.clientY, hit(event.target, event.clientX, event.clientY)]
  }, true)
  document.addEventListener('pointerup', event => {
    const start = press
    press = null
    if (!start || !owns(event) || event.pointerId !== start[0]
      || Math.hypot(event.clientX - start[1], event.clientY - start[2]) > 12) return
    const next = hit(event.target, event.clientX, event.clientY)
    if (!next || next !== start[3]) return
    action = next
    lockAngle = controller.motion.angle
    activation = [event.timeStamp, controller._placement?.()]
    tube.dataset.crtCursorActivationCount = String((Number(tube.dataset.crtCursorActivationCount) || 0) + 1)
    foley.ensure()
    foley.blip()
  }, true)

  const baseFrame = controller.frame.bind(controller)
  controller.frame = ms => {
    const previous = controller.state
    if (previous === ACTIVE || previous === ABSORBING) {
      const motion = controller.motion
      const next = hit(document.elementFromPoint(motion.x, motion.y), motion.x, motion.y)
      if (next !== action) {
        action = next
        if (next) lockAngle = motion.angle
      }
    }

    const rawAngle = controller.motion.angle
    if (previous === ACTIVE && action) {
      controller.motion.angle = rawAngle
        + Math.atan2(Math.sin(lockAngle - rawAngle), Math.cos(lockAngle - rawAngle)) * 0.58
    }
    baseFrame(ms)
    controller.motion.angle = rawAngle

    if (previous === ABSORBING && controller.state === ACTIVE && !controller.reducedMotionQuery.matches) foley.blip()

    let click = activation ? Math.max(0, 1 - (ms - activation[0]) / 110) : 0
    click *= click
    if (!click) activation = null

    if (controller.state !== ACTIVE) {
      activation = null
      action = null
      return
    }

    const state = app.crt.getCursorState()
    if (state.visible) {
      app.crt.setCursorState({
        compression: state.compression + (action ? 0.055 : 0) + click * 0.075,
        hoverIntensity: action ? 0.48 : 0,
        clickImpulse: click * 0.52,
      })
    } else if (controller.view.last) {
      controller.view.update({
        ...controller.view.last,
        phosphor: controller.view.last.phosphor + (action ? 0.10 : 0) + click * 0.12,
        compression: controller.view.last.compression + (action ? 0.055 : 0) + click * 0.085,
      })
    }
    if (click && activation?.[1]) {
      const reaction = app.crt.getReactionState()
      controller._applyReaction(activation[1], {
        strength: Math.min(1, (reaction.active ? reaction.strength : 0) + click * 0.14),
        submergedStrength: Math.min(1, (reaction.active ? reaction.submergedStrength : 0) + click * 0.08),
        recoilStrength: Math.max(-1, Math.min(1, (reaction.active ? reaction.recoilStrength : 0) + click * 0.04)),
      }, 'interaction')
    }
  }
}
