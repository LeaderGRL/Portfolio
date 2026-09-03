import { foley } from './audio.js'
import { ROUTES } from './panel.js'

/* ========================================================================== *
 * Full-screen softkeys
 *
 * When the glass fills the viewport the chassis — and with it every physical
 * key — is set aside. Pointer and touch users still need to change section,
 * go back, open a listing and leave full screen, so the tube grows a softkey
 * row along its bottom edge, the way period terminals labelled their
 * function keys on the last screen line. It is drawn in the raster's own
 * phosphor language rather than as browser chrome, and it only exists while
 * full screen is on: the physical panel remains the only control surface on
 * the desk.
 *
 * App owns navigation; this module only mirrors its state (the selected route
 * follows the panel LED) and forwards presses to the same go/enter/back calls
 * the physical keys use.
 * ========================================================================== */

const SHORTCUTS = { home: '0', about: '1', resume: '2', projects: '3', articles: '4', contact: '5' }

function makeSoftkey(label, { shortcut = '', cls = '', ariaLabel = '' } = {}) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `softkeys__key${cls ? ` ${cls}` : ''}`
  if (shortcut) {
    const kbd = document.createElement('kbd')
    kbd.textContent = shortcut
    kbd.setAttribute('aria-hidden', 'true')
    button.append(kbd)
  }
  const text = document.createElement('span')
  text.className = 'softkeys__label'
  text.textContent = label
  button.append(text)
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel)
  if (shortcut) button.setAttribute('aria-keyshortcuts', shortcut)

  // Pointer presses release focus like the panel; keyboard activation keeps
  // its place in the tab order. App also routes terminal arrows from softkeys.
  button.addEventListener('pointerdown', () => { foley.ensure(); foley.key(true) })
  button.addEventListener('pointerup', () => foley.key(false))
  button.addEventListener('pointercancel', () => foley.key(false))
  button.addEventListener('click', event => { if (event.detail > 0) button.blur() })
  return button
}

export function installFullscreenSoftkeys(app) {
  const screen = document.getElementById('screen')
  const navKeys = document.getElementById('nav-keys')
  if (!app || !screen || screen.querySelector('.softkeys')) return null

  const nav = document.createElement('nav')
  nav.className = 'softkeys'
  nav.id = 'softkeys'
  nav.setAttribute('aria-label', 'Screen controls')

  const group = cls => {
    const node = document.createElement('div')
    node.className = `softkeys__group${cls ? ` ${cls}` : ''}`
    nav.append(node)
    return node
  }

  const routes = group('softkeys__group--routes')
  const routeKeys = {}
  for (const route of ROUTES) {
    const key = makeSoftkey(route.label, { shortcut: SHORTCUTS[route.id] || '' })
    key.dataset.route = route.id
    key.addEventListener('click', () => app.go(route.id))
    routes.append(key)
    routeKeys[route.id] = key
  }

  const actions = group('softkeys__group--actions')
  const back = makeSoftkey('BACK', { cls: 'softkeys__key--back' })
  back.setAttribute('aria-keyshortcuts', 'Backspace')
  back.addEventListener('click', () => app.back())
  const enter = makeSoftkey('ENTER', { cls: 'softkeys__key--enter' })
  enter.addEventListener('click', () => app.enter())
  actions.append(back, enter)

  const mode = group('softkeys__group--mode')
  const exit = makeSoftkey('EXIT FULL SCREEN', {
    shortcut: 'F',
    cls: 'softkeys__key--exit',
    ariaLabel: 'Exit full screen',
  })
  exit.addEventListener('click', () => app.setFullscreen(false))
  mode.append(exit)

  screen.append(nav)

  // The selected route belongs to the panel LED; mirror it instead of keeping
  // a second copy of navigation state.
  const sync = () => {
    for (const key of navKeys?.querySelectorAll('.key') || []) {
      const id = ROUTES.find(route => route.label === key.getAttribute('aria-label'))?.id
      const soft = id && routeKeys[id]
      if (!soft) continue
      const on = key.classList.contains('is-on')
      soft.classList.toggle('is-on', on)
      if (on) soft.setAttribute('aria-current', 'page')
      else soft.removeAttribute('aria-current')
    }
  }
  let observer = null
  if (navKeys) {
    observer = new MutationObserver(sync)
    observer.observe(navKeys, { subtree: true, attributes: true, attributeFilter: ['class'] })
  }
  sync()

  return {
    element: nav,
    sync,
    destroy() {
      observer?.disconnect()
      nav.remove()
    },
  }
}
