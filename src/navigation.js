/* ========================================================================== *
 * Browser navigation
 *
 * The CRT is a single-page runtime, but portfolio documents still need stable
 * shareable URLs. These helpers keep URL/history/metadata separate from App's
 * rendering state so routing does not leak into the display pipeline.
 * ========================================================================== */

const SIMPLE_ROUTES = new Set(['home', 'about', 'resume', 'projects', 'articles', 'contact'])
const BASE_TITLE = 'Jordan Grilly — Systems / Performance / Architecture'
const BASE_DESCRIPTION = 'Portfolio of Jordan Grilly, systems and performance engineer.'

function normalizePath(pathname = '/') {
  const path = String(pathname || '/').replace(/\/{2,}/g, '/').replace(/\/$/, '')
  return path || '/'
}

function decodeSegment(value = '') {
  try { return decodeURIComponent(value) } catch { return value }
}

export function resolveNavigation(content, pathname = globalThis.location?.pathname || '/') {
  const path = normalizePath(pathname)
  if (path === '/') return { route: 'home', item: null, cursor: 0, valid: true }

  const segments = path.slice(1).split('/').filter(Boolean).map(decodeSegment)
  const route = segments[0]
  if (!SIMPLE_ROUTES.has(route) || route === 'home') {
    return { route: 'home', item: null, cursor: 0, valid: false }
  }

  if (route !== 'projects' && route !== 'articles') {
    return { route, item: null, cursor: 0, valid: segments.length === 1 }
  }

  const pool = route === 'projects' ? content.projects : content.articles
  if (segments.length === 1) return { route, item: null, cursor: 0, valid: true }

  const id = segments[1]
  const cursor = pool.findIndex(item => item.id === id)
  if (cursor < 0 || segments.length > 2) {
    return { route, item: null, cursor: 0, valid: false }
  }

  return { route, item: pool[cursor], cursor, valid: true }
}

export function pathForState(state) {
  const route = state?.route || 'home'
  if (route === 'home' || route === 'boot') return '/'
  if ((route === 'projects' || route === 'articles') && state?.item?.id) {
    return `/${route}/${encodeURIComponent(state.item.id)}`
  }
  return `/${route}`
}

function ensureMeta(selector, attributes) {
  let node = document.head.querySelector(selector)
  if (!node) {
    node = document.createElement('meta')
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
    document.head.append(node)
  }
  return node
}

function ensureCanonical() {
  let node = document.head.querySelector('link[rel="canonical"]')
  if (!node) {
    node = document.createElement('link')
    node.rel = 'canonical'
    document.head.append(node)
  }
  return node
}

export function syncNavigationMetadata(state) {
  if (typeof document === 'undefined') return

  const item = state?.item || null
  const route = state?.route || 'home'
  const section = route === 'home' ? '' : route.charAt(0).toUpperCase() + route.slice(1)
  const title = item?.label
    ? `${item.label} — Jordan Grilly`
    : section
      ? `${section} — Jordan Grilly`
      : BASE_TITLE
  const description = item?.sub || (section ? `${section} — ${BASE_DESCRIPTION}` : BASE_DESCRIPTION)
  const path = pathForState(state)
  const absoluteUrl = new URL(path, globalThis.location?.origin || 'http://localhost').href

  document.title = title
  const descriptionMeta = ensureMeta('meta[name="description"]', { name: 'description' })
  descriptionMeta.setAttribute('content', description)

  const ogTitle = ensureMeta('meta[property="og:title"]', { property: 'og:title' })
  const ogDescription = ensureMeta('meta[property="og:description"]', { property: 'og:description' })
  const ogUrl = ensureMeta('meta[property="og:url"]', { property: 'og:url' })
  const ogType = ensureMeta('meta[property="og:type"]', { property: 'og:type' })
  ogTitle.setAttribute('content', title)
  ogDescription.setAttribute('content', description)
  ogUrl.setAttribute('content', absoluteUrl)
  ogType.setAttribute('content', item ? 'article' : 'website')

  ensureCanonical().href = absoluteUrl
}

export function syncNavigationHistory(state, mode = 'push') {
  if (typeof history === 'undefined' || typeof location === 'undefined') return
  const path = pathForState(state)
  if (normalizePath(location.pathname) === normalizePath(path)) return

  const method = mode === 'replace' ? 'replaceState' : 'pushState'
  history[method]({ route: state?.route || 'home', item: state?.item?.id || null }, '', path)
}
