/* ==========================================================================
 * CONTENT
 *
 * The site's text lives in content/ as Markdown. plugins/content.js parses it
 * at build time into typed blocks; this module is the seam between that
 * bundle and the renderer, so the two can change independently.
 *
 * Nothing here is edited to change the site. Edit content/*.md.
 * ======================================================================== */
import bundle from 'virtual:content'

const listEntry = (d) => ({
  id: d.id,
  label: d.title,
  sub: d.sub || '',
  meta: d.status || d.year || '',
  stack: d.stack || [],
  link: d.link || '',
  blocks: d.blocks || [],
})

export const CONTENT = {
  identity: bundle.identity,
  model: bundle.model,
  made: bundle.made,
  contact: bundle.contact.map(c => [c.label, c.value]),
  projects: bundle.projects.map(listEntry),
  articles: bundle.articles.map(listEntry),
  pages: bundle.pages,
}

/** Every media file referenced anywhere, so the loader can warm them before a
 *  page that needs them is routed to. */
export const MEDIA = [
  ...CONTENT.projects, ...CONTENT.articles, ...Object.values(CONTENT.pages),
].flatMap(d => d.blocks || [])
 .filter(b => b.type === 'image' || b.type === 'video')
 .map(b => b.src)

export function findItem(route, id) {
  const pool = route === 'articles' ? CONTENT.articles : CONTENT.projects
  return pool.find(x => x.id === id) || null
}
