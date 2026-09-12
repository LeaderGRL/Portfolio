import { foley } from '../audio.js'
import { articleReaderScroll } from '../article-reader.js'
import { ROUTES, makeKey } from '../panel.js'

const INTERACTIVE_KEY_TARGET = [
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

export class InputController {
  constructor(app, machine) {
    this.app = app
    this.machine = machine
  }

  install() {
    this.buildKeys()
    this.bindControls()
    this.bindKeyboard()
    this.bindWheel(document.getElementById('tube'))
  }

  buildKeys() {
    const app = this.app
    const nav = document.getElementById('nav-keys')
    app.navKeys = {}
    for (const route of ROUTES) {
      const key = makeKey(route.label, '', route.icon)
      key.setAttribute('aria-label', route.label)
      key.addEventListener('click', () => app.go(route.id))
      nav.appendChild(key)
      app.navKeys[route.id] = key
    }

    const actions = document.getElementById('action-keys')
    app.enterKey = makeKey('ENTER', 'key--sm key--go')
    app.enterKey.addEventListener('click', () => app.enter())
    app.backKey = makeKey('← BACK', 'key--sm')
    app.backKey.addEventListener('click', () => app.back())
    actions.appendChild(app.enterKey)
    actions.appendChild(app.backKey)
  }

  bindControls() {
    const app = this.app
    const machine = this.machine
    document.getElementById('crt-switch')?.addEventListener('click', () => machine.toggleCrt())
    document.getElementById('fullscreen-switch')?.addEventListener('click', () => app.toggleFullscreen())

    const slider = document.getElementById('volume')
    if (slider) {
      const fromEvent = event => {
        const rect = slider.getBoundingClientRect()
        const scale = rect.width / slider.offsetWidth
        return ((event.clientX - rect.left) / scale - 8) / (slider.offsetWidth - 16)
      }
      slider.addEventListener('pointerdown', event => {
        foley.ensure()
        slider.setPointerCapture?.(event.pointerId)
        slider.dataset.drag = '1'
        machine.setVolume(fromEvent(event))
      })
      slider.addEventListener('pointermove', event => {
        if (slider.dataset.drag) machine.setVolume(fromEvent(event))
      })
      const stop = () => { delete slider.dataset.drag }
      slider.addEventListener('pointerup', stop)
      slider.addEventListener('pointercancel', stop)
      slider.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          machine.setVolume(app.volume - 0.05)
          event.preventDefault()
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          machine.setVolume(app.volume + 0.05)
          event.preventDefault()
        }
      })
      requestAnimationFrame(() => machine.setVolume(0.35))
    }

    document.getElementById('power')?.addEventListener('click', () => machine.togglePower())
  }

  bindKeyboard() {
    const app = this.app
    addEventListener('keydown', event => {
      const key = event.key
      const interactive = event.target instanceof Element ? event.target.closest(INTERACTIVE_KEY_TARGET) : null
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return

      if (key === 'Escape' && app.state.fullscreen) {
        event.preventDefault()
        app.setFullscreen(false)
        return
      }
      if (key === 'Escape' || key === 'Backspace') {
        event.preventDefault()
        app.backKey.tap()
        app.back()
        return
      }
      const softkey = interactive?.matches('.softkeys__key')
      if ((key === 'f' || key === 'F') && (!interactive || softkey || interactive.id === 'fullscreen-switch')) {
        if (!event.repeat) {
          event.preventDefault()
          app.toggleFullscreen()
        }
        return
      }
      if (interactive && (!softkey || key === 'Enter' || key === ' ')) return

      const number = '12345'.indexOf(key)
      if (number >= 0) {
        app.navKeys[ROUTES[number + 1].id].tap()
        app.go(ROUTES[number + 1].id)
        return
      }
      if (key === '0' || key === 'h') {
        app.navKeys.home.tap()
        app.go('home')
        return
      }
      if (key === 'ArrowDown') {
        event.preventDefault()
        if (app.state.item) {
          if (!articleReaderScroll('line-down')) app.scrollBy(2)
        } else app.move(1)
      } else if (key === 'ArrowUp') {
        event.preventDefault()
        if (app.state.item) {
          if (!articleReaderScroll('line-up')) app.scrollBy(-2)
        } else app.move(-1)
      } else if (key === 'PageDown') {
        event.preventDefault()
        if (!articleReaderScroll('down')) app.scrollBy(app.term.rows - 2)
      } else if (key === 'PageUp') {
        event.preventDefault()
        if (!articleReaderScroll('up')) app.scrollBy(-(app.term.rows - 2))
      } else if (key === 'Home' && app.state.item) {
        event.preventDefault()
        if (!articleReaderScroll('home')) app.scrollTo(0)
      } else if (key === 'End' && app.state.item) {
        event.preventDefault()
        if (!articleReaderScroll('end')) app.scrollTo(1e9)
      } else if (key === 'Enter') {
        event.preventDefault()
        app.enterKey.tap()
        app.enter()
      } else if (key === 'p' || key === 'P') {
        document.getElementById('power')?.click()
      } else if (key === 'c' || key === 'C') {
        document.getElementById('crt-switch')?.click()
      }
    })
  }

  bindWheel(element) {
    element?.addEventListener('wheel', event => {
      if (event.target.closest && event.target.closest('.article-reader')) return
      if (!this.app.term || !this.app.term.maxScroll) return
      event.preventDefault()
      this.app.scrollBy(Math.sign(event.deltaY) * 2)
    }, { passive: false })
  }
}
