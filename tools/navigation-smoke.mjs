import { JSDOM } from 'jsdom'
import { pathForState, resolveNavigation, syncNavigationMetadata, syncNavigationHistory } from '../src/navigation.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(58)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const content = {
  projects: [
    { id: 'frogbyte', label: 'FROGBYTE', sub: 'Rust engine' },
    { id: 'penw', label: 'PROJECT ECHO : NEON WAVE', sub: 'Arcade rhythm game' },
  ],
  articles: [
    { id: 'cpu-cache-optimization', label: 'CPU CACHES', sub: 'Cache optimization article' },
  ],
}

const project = resolveNavigation(content, '/projects/frogbyte')
check(project.valid && project.route === 'projects', 'project deep link resolves')
check(project.item?.id === 'frogbyte' && project.cursor === 0, 'project deep link restores selected item')

const article = resolveNavigation(content, '/articles/cpu-cache-optimization')
check(article.valid && article.item?.id === 'cpu-cache-optimization', 'article deep link resolves')

const listing = resolveNavigation(content, '/projects')
check(listing.valid && !listing.item, 'collection route resolves without a document')

const restoredListing = resolveNavigation(content, '/projects', {
  marker: 'jg1500-navigation-v1',
  route: 'projects',
  item: null,
  cursor: 1,
})
check(restoredListing.cursor === 1, 'collection history restores selected cursor')

const invalid = resolveNavigation(content, '/projects/does-not-exist')
check(!invalid.valid && invalid.route === 'projects' && !invalid.item, 'invalid document falls back to collection')

check(pathForState({ route: 'home', item: null }) === '/', 'HOME serializes to root')
check(pathForState({ route: 'about', item: null }) === '/about', 'simple page serializes to route')
check(pathForState({ route: 'projects', item: content.projects[0] }) === '/projects/frogbyte', 'project serializes to stable deep link')

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://portfolio.example/projects' })
globalThis.document = dom.window.document
globalThis.location = dom.window.location
globalThis.history = dom.window.history

syncNavigationHistory({ route: 'projects', item: null, cursor: 1 }, 'replace')
check(history.state?.cursor === 1, 'same-path replace persists collection cursor')

syncNavigationHistory({ route: 'projects', item: content.projects[1], cursor: 1 }, 'push', { parentPath: '/projects' })
check(location.pathname === '/projects/penw', 'detail push updates browser path')
check(history.state?.parentPath === '/projects', 'detail history records its collection parent')

syncNavigationMetadata({ route: 'projects', item: content.projects[0] })
check(document.title === 'FROGBYTE — Jordan Grilly', 'document title follows active item')
check(document.querySelector('meta[name="description"]')?.content === 'Rust engine', 'meta description follows active item')
check(document.querySelector('meta[property="og:title"]')?.content === 'FROGBYTE — Jordan Grilly', 'Open Graph title follows active item')
check(document.querySelector('link[rel="canonical"]')?.href === 'https://portfolio.example/projects/frogbyte', 'canonical URL follows deep link')

console.log(failed ? `\n  ${failed} navigation check(s) FAILED` : '\n  all navigation checks passed')
process.exit(failed ? 1 : 0)
