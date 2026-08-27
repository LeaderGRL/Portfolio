import { CHAR_H, PAD_Y, SRC_H } from './core.js'
import { CONTENT } from './content.js'

/* ========================================================================== *
 * Runtime coarse-pointer controls
 *
 * App owns keyboard boundaries and viewport sizing. This module only augments
 * coarse-pointer hit testing without changing the visible industrial sprites,
 * and turns terminal listing rows into direct touch targets on compact layouts.
 * ========================================================================== */

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  'iframe',
  'video',
  'audio',
  '[role="button"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="link"]',
  '[role="application"]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

const MIN_TARGET_PX = 24
const LIST_FIRST_ROW = 3
const TAP_SLOP_PX = 12

function closestInteractive(target) {
  return target instanceof Element ? target.closest(INTERACTIVE_SELECTOR) : null
}

function expandedRect(rect, minimum = MIN_TARGET_PX) {
  const width = Math.max(rect.width, minimum)
  const height = Math.max(rect.height, minimum)
  const cx = rect.left + rect.width * 0.5
  const cy = rect.top + rect.height * 0.5
  return {
    left: cx - width * 0.5,
    right: cx + width * 0.5,
    top: cy - height * 0.5,
    bottom: cy + height * 0.5,
    cx,
    cy,
  }
}

function contains(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function setSliderFromPoint(slider, clientX) {
  const rect = slider.getBoundingClientRect()
  if (!rect.width) return

  const desired = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  const current = Number(slider.getAttribute('aria-valuenow')) || 0
  const steps = Math.round((desired - current) / 5)
  if (!steps) return

  const key = steps > 0 ? 'ArrowRight' : 'ArrowLeft'
  for (let index = 0; index < Math.abs(steps); index++) {
    slider.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    }))
  }
}

function bindCompactTargetExpansion() {
  const machine = document.getElementById('machine')
  if (!machine) return () => {}

  const onPointerUp = event => {
    if (!event.isPrimary || event.button > 0) return
    if (!machine.classList.contains('is-compact')) return
    if (closestInteractive(event.target)) return

    const controls = [
      ...document.querySelectorAll('#nav-keys .key'),
      document.getElementById('crt-switch'),
      document.getElementById('volume'),
      document.getElementById('power'),
    ].filter(Boolean)

    const candidates = []
    for (const control of controls) {
      const rect = control.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      const hit = expandedRect(rect)
      if (!contains(hit, event.clientX, event.clientY)) continue
      const dx = event.clientX - hit.cx
      const dy = event.clientY - hit.cy
      candidates.push({ control, distance: dx * dx + dy * dy })
    }

    candidates.sort((a, b) => a.distance - b.distance)
    const control = candidates[0]?.control
    if (!control) return

    event.preventDefault()
    if (control.id === 'volume') {
      control.focus({ preventScroll: true })
      setSliderFromPoint(control, event.clientX)
    } else {
      control.click()
    }
  }

  document.addEventListener('pointerup', onPointerUp)
  return () => document.removeEventListener('pointerup', onPointerUp)
}

function bindScreenListingPointer(app) {
  const tube = document.getElementById('tube')
  const machine = document.getElementById('machine')
  if (!tube || !machine) return () => {}

  const starts = new Map()

  const onPointerDown = event => {
    if (!event.isPrimary || event.button > 0) return
    if (!machine.classList.contains('is-compact')) return
    if (closestInteractive(event.target)) return
    starts.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const clear = event => starts.delete(event.pointerId)

  const onPointerUp = event => {
    const start = starts.get(event.pointerId)
    starts.delete(event.pointerId)
    if (!start || !event.isPrimary || event.button > 0) return
    if (!machine.classList.contains('is-compact')) return
    if (closestInteractive(event.target)) return

    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.hypot(dx, dy) > TAP_SLOP_PX) return

    const route = app.state?.route
    if ((route !== 'projects' && route !== 'articles') || app.state?.item) return

    const items = route === 'projects' ? CONTENT.projects : CONTENT.articles
    const rect = tube.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const sourceY = ((event.clientY - rect.top) / rect.height) * SRC_H
    const row = Math.floor((sourceY - PAD_Y) / CHAR_H)
    const relativeRow = row - LIST_FIRST_ROW
    if (relativeRow < 0) return

    const index = Math.floor(relativeRow / 2)
    if (index < 0 || index >= items.length) return

    app.state.cursor = index
    app.render()
    app.enter()
  }

  tube.addEventListener('pointerdown', onPointerDown)
  tube.addEventListener('pointerup', onPointerUp)
  tube.addEventListener('pointercancel', clear)

  return () => {
    tube.removeEventListener('pointerdown', onPointerDown)
    tube.removeEventListener('pointerup', onPointerUp)
    tube.removeEventListener('pointercancel', clear)
    starts.clear()
  }
}

export function installRuntimeControls(app) {
  const cleanups = [
    bindCompactTargetExpansion(),
    bindScreenListingPointer(app),
  ]

  return () => {
    for (const cleanup of cleanups.reverse()) cleanup?.()
  }
}
