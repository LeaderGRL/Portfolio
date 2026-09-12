import { foley } from '../audio.js'
import { REDUCED, lerp } from '../core.js'
import { PAGES } from '../pages.js'

export class RenderController {
  constructor(app) {
    this.app = app
  }

  start() {
    this.boot()
    requestAnimationFrame(time => this.frame(time))
  }

  render(retype = false) {
    const app = this.app
    const state = app.state
    const keepScroll = app.term.scroll
    app.term.clear()
    const documentItem = (state.route === 'articles' || state.route === 'projects') && state.item
      ? state.item
      : null

    if (documentItem) {
      app.term.put(4, 3, documentItem.label.slice(0, app.term.cols - 8), 'bright')
      if (documentItem.sub) app.term.put(4, 5, documentItem.sub.slice(0, app.term.cols - 8), 'dim')
      app.term.put(4, 7, 'DOCUMENT VIEW ACTIVE', 'mid')
    } else {
      const page = PAGES[state.route] || PAGES.home
      page(app.term, state)
    }

    app.documentRuntime?.syncSource?.()
    app.term.scroll = retype ? 0 : Math.min(keepScroll, app.term.maxScroll)
    const tube = document.getElementById('tube')
    if (tube) tube.dataset.terminalScroll = String(app.term.scroll)
    app.total = app.term.countGlyphs()
    if (retype) {
      app.reveal = 0
      this.announce()
    }
    app.revealTarget = app.total
    app.dirty = true
  }

  announce() {
    const app = this.app
    const lines = []
    for (let y = 0; y < app.term.docRows; y++) {
      let text = ''
      for (let x = 0; x < app.term.cols; x++) {
        const cell = app.term.cells[y * app.term.cols + x]
        text += cell ? cell.ch : ' '
      }
      text = text.replace(/[─│┌┐└┘├┤┬┴┼█▓▒░▸▶]/g, ' ').trimEnd()
      if (text.trim()) lines.push(text.trim())
    }
    document.getElementById('live').textContent = lines.join('. ')
  }

  boot() {
    const app = this.app
    const terminal = app.term
    terminal.clear()
    app.state.route = 'boot'
    const lines = [
      'JG-1500 TERMINAL — FIRMWARE 2.6.1',
      '',
      'MEMORY CHECK ............ 640K OK',
      'PHOSPHOR ................ P1 GREEN',
      'DEFLECTION COILS ........ NOMINAL',
      'GLYPH ROM ............... 8x14 LOADED',
      'PORTFOLIO IMAGE ......... MOUNTED',
      '',
      'READY.',
    ]
    lines.forEach((line, index) => terminal.put(4, 3 + index, line, index === 0 ? 'bright' : 'mid'))
    app.total = terminal.countGlyphs()
    app.reveal = 0
    app.revealTarget = app.total
    app.booting = true
    app.dirty = true
    foley.humOn(true)
    foley.degauss()
    app.state.degauss = 1
    setTimeout(() => {
      app.booting = false
      app._restoreNavigation()
    }, REDUCED ? 80 : 1200)
  }

  frame(ms) {
    const app = this.app
    const state = app.state
    const time = ms / 1000
    const dt = Math.min(0.05, time - (app._last || time))
    app._last = time
    state.time = time

    state.power = lerp(state.power, state.powerTarget, 1 - Math.pow(0.001, dt * 1.6))
    state.crt = lerp(state.crt, state.crtTarget, 1 - Math.pow(0.001, dt * 3))
    state.degauss = Math.max(0, state.degauss - dt * 0.9)
    state.static = Math.max(0, state.static - dt * 4.5)
    state.warm = Math.min(1, state.warm + dt * 0.55)

    const date = new Date()
    const pad = value => String(value).padStart(2, '0')
    const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    const elapsed = Math.max(0, Math.floor(time - app.bootAt))
    const uptime = `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor(elapsed / 60) % 60)}:${pad(elapsed % 60)}`
    if (clock !== state.clock) {
      state.clock = clock
      state.uptime = uptime
      if (!app.booting && state.route === 'home' && !state.item) this.render()
    }

    if (app.reveal < app.revealTarget) {
      const speed = REDUCED ? 100000 : (app.booting ? 360 : 900)
      const before = Math.floor(app.reveal)
      app.reveal = Math.min(app.revealTarget, app.reveal + speed * dt)
      if (Math.floor(app.reveal) !== before) {
        app.dirty = true
        if (!REDUCED && time - app.lastBlip > 0.028) {
          foley.blip(0.18)
          app.lastBlip = time
        }
      }
    }

    const blink = Math.floor(time * 2) % 2 === 0
    if (blink !== app._blink) {
      app._blink = blink
      if (!app.documentRuntime?.isDocument?.()) app.dirty = true
    }

    app.tilt?.frame?.()
    app.documentRuntime?.frame?.(ms)
    const sourceDirty = app.dirty
    if (sourceDirty) {
      const handled = app.documentRuntime?.paint?.(Math.floor(app.reveal)) || false
      if (!handled) {
        app.raster.paint(
          app.term,
          Math.floor(app.reveal),
          blink && app.reveal >= app.revealTarget,
        )
      }
    }

    if (app.crt.ok) {
      app.crt.render(state, sourceDirty)
      if (!app.crt.ok) document.getElementById('tube').classList.add('is-fallback')
    }
    app.dirty = false
    requestAnimationFrame(next => this.frame(next))
  }
}
