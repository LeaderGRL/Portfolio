import { CHAR_H, CHAR_W, PAD_X, PAD_Y, SRC_H, SRC_W } from './core.js'

/* ========================================================================== *
 * Contact link hit layer
 *
 * CONTACT is rendered into the terminal framebuffer. These native anchors sit
 * over the exact text rows so the visible CRT labels remain clickable without
 * replacing the terminal renderer or drawing a second copy of the content.
 * ========================================================================== */

const CONTACT_FIRST_ROW = 7
const CONTACT_ROW_STRIDE = 3
const CONTACT_TARGET_ROWS = 3

function hrefForContact(label, value) {
  const key = String(label || '').toLowerCase()
  const text = String(value || '').trim()
  if (!text) return ''
  if (key === 'email') return `mailto:${text}`
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text
  return `https://${text.replace(/^\/+/, '')}`
}

function ensureLayer() {
  const tube = document.getElementById('tube')
  if (!tube) return null
  let layer = tube.querySelector('.terminal-contact-links')
  if (!layer) {
    layer = document.createElement('nav')
    layer.className = 'terminal-contact-links'
    layer.setAttribute('aria-label', 'Contact links')
    tube.append(layer)
  }
  return layer
}

export function syncContactLinks(route, contacts = []) {
  const layer = ensureLayer()
  if (!layer) return

  if (route !== 'contact') {
    layer.hidden = true
    layer.replaceChildren()
    return
  }

  layer.hidden = false
  layer.replaceChildren()

  contacts.forEach(([label, value], index) => {
    const href = hrefForContact(label, value)
    if (!href) return

    const row = CONTACT_FIRST_ROW + index * CONTACT_ROW_STRIDE
    const x = PAD_X + 17 * CHAR_W
    const centerY = PAD_Y + row * CHAR_H + CHAR_H * 0.5
    const targetHeight = CONTACT_TARGET_ROWS * CHAR_H
    const y = centerY - targetHeight * 0.5
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.className = 'terminal-contact-link'
    anchor.style.left = `${(x / SRC_W) * 100}%`
    anchor.style.top = `${(y / SRC_H) * 100}%`
    anchor.style.width = `${((SRC_W - PAD_X - x) / SRC_W) * 100}%`
    anchor.style.height = `${(targetHeight / SRC_H) * 100}%`
    anchor.setAttribute('aria-label', `${label}: ${value}`)
    anchor.title = `${label}: ${value}`
    if (!href.startsWith('mailto:')) {
      anchor.target = '_blank'
      anchor.rel = 'noreferrer noopener'
    }
    layer.append(anchor)
  })
}
