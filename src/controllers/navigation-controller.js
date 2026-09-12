import { foley } from '../audio.js'
import { CONTENT } from '../content.js'
import { clamp } from '../core.js'
import { resolveNavigation, syncNavigationHistory, syncNavigationMetadata } from '../navigation.js'
import { ROUTES } from '../panel.js'

export class NavigationController {
  constructor(app) {
    this.app = app
  }

  install() {
    addEventListener('popstate', () => this.restore())
  }

  commit(mode = 'push', extraState = {}) {
    syncNavigationHistory(this.app.state, mode, extraState)
    syncNavigationMetadata(this.app.state)
  }

  restore() {
    const app = this.app
    if (app.booting) return
    const target = resolveNavigation(CONTENT)
    app.state.route = target.route
    app.state.item = target.item
    app.state.cursor = target.cursor
    app.state.static = 0.8
    app.render(true)
    this.syncKeys()
    syncNavigationMetadata(app.state)
    if (!target.valid) syncNavigationHistory(app.state, 'replace')
  }

  go(route, { historyMode = 'push' } = {}) {
    const app = this.app
    foley.ensure()
    if (app.state.route === route && !app.state.item) return
    app.state.route = route
    app.state.item = null
    if (route === 'projects' || route === 'articles') app.state.cursor = 0
    app.state.static = 1
    foley.sweep()
    app.render(true)
    this.syncKeys()
    this.commit(historyMode)
  }

  scrollBy(rows) {
    const app = this.app
    if (!app.term || !app.term.maxScroll) return
    if (app.term.scrollBy(rows)) {
      foley.blip && foley.blip()
      app.render(false)
    }
  }

  scrollTo(rows) {
    if (!this.app.term) return
    this.app.term.scroll = 0
    this.scrollBy(rows)
  }

  move(delta) {
    const app = this.app
    const state = app.state
    if (state.item) {
      const items = state.route === 'projects' ? CONTENT.projects : CONTENT.articles
      const index = clamp(items.indexOf(state.item) + delta, 0, items.length - 1)
      state.item = items[index]
      state.cursor = index
      state.static = 0.6
      foley.sweep()
      app.render(true)
      this.commit('replace')
      return
    }
    if (state.route !== 'projects' && state.route !== 'articles') return
    const items = state.route === 'projects' ? CONTENT.projects : CONTENT.articles
    state.cursor = clamp(state.cursor + delta, 0, items.length - 1)
    foley.blip()
    app.render()
    this.commit('replace')
  }

  enter() {
    const app = this.app
    const state = app.state
    if (state.route === 'projects' || state.route === 'articles') {
      if (state.item) return
      const items = state.route === 'projects' ? CONTENT.projects : CONTENT.articles
      const parentPath = `/${state.route}`
      state.item = items[state.cursor]
      state.static = 1
      foley.sweep()
      app.render(true)
      this.commit('push', { parentPath })
    } else if (state.route === 'home') {
      app.navKeys.projects.tap()
      this.go('projects')
    }
  }

  back() {
    const app = this.app
    if (app.documentRuntime?.handleBack?.()) return
    const state = app.state
    if (state.item) {
      const expectedParent = `/${state.route}`
      if (history.state?.parentPath === expectedParent && history.length > 1) {
        history.back()
        return
      }
      state.item = null
      state.static = 0.8
      foley.sweep()
      app.render(true)
      this.commit('replace')
      return
    }
    if (state.route !== 'home') {
      app.navKeys.home.tap()
      this.go('home', { historyMode: 'replace' })
    }
  }

  syncKeys() {
    for (const route of ROUTES) {
      this.app.navKeys[route.id].classList.toggle('is-on', route.id === this.app.state.route)
    }
  }
}
