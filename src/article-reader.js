/* Rich semantic document surface inside the physical CRT aperture.
 *
 * Visible pixels come from the raster/CRT pipeline. This DOM mirror owns
 * semantics, native media controls and the scroll range used by long-form
 * ARTICLES and PROJECTS.
 */

const make = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const INLINE_TOKEN = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g

function appendInline(node, value = '') {
  let cursor = 0
  for (const match of value.matchAll(INLINE_TOKEN)) {
    if (match.index > cursor) node.append(document.createTextNode(value.slice(cursor, match.index)))
    const token = match[0]
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
    if (link) {
      const anchor = make('a', 'article-reader__link', link[1])
      anchor.href = link[2]
      anchor.target = '_blank'
      anchor.rel = 'noreferrer noopener'
      node.append(anchor)
    } else if (token.startsWith('**') || token.startsWith('__')) {
      node.append(make('strong', '', token.slice(2, -2)))
    } else if (token.startsWith('`')) {
      node.append(make('code', 'article-reader__inline-code', token.slice(1, -1)))
    } else {
      node.append(make('em', '', token.slice(1, -1)))
    }
    cursor = match.index + token.length
  }
  if (cursor < value.length) node.append(document.createTextNode(value.slice(cursor)))
  return node
}

const makeRich = (tag, className, text) => appendInline(make(tag, className), text)

function richSpacer(block, height, label) {
  const section = make('section', 'article-reader__rich-spacer')
  section.style.minHeight = `${height}px`
  section.dataset.blockType = block.type
  section.setAttribute('aria-label', label)
  return section
}

function countRows(block) {
  return String(block.body || '').split('\n').filter(line => line.trim()).length
}

function clampMediaHeight(value) {
  const height = Number(value) || 246
  return Math.max(150, Math.min(340, height))
}

function mediaGap(value) {
  const gap = Number(value)
  if (Number.isFinite(gap)) return Math.max(12, Math.min(48, gap))
  return 24
}

function renderBlock(block) {
  switch (block.type) {
    case 'heading':
      return makeRich(block.level >= 3 ? 'h3' : 'h2', `article-reader__heading article-reader__heading--${block.level || 2}`, block.text)
    case 'prose':
      return makeRich('p', 'article-reader__prose', block.text)
    case 'list': {
      const list = make(block.ordered ? 'ol' : 'ul', 'article-reader__list')
      for (const item of block.items) list.append(makeRich('li', '', item))
      return list
    }
    case 'code': {
      const pre = make('pre', 'article-reader__code')
      const code = make('code', '', block.body || '')
      if (block.language) code.dataset.language = block.language
      pre.append(code)
      return pre
    }
    case 'image': {
      const figure = make('figure', 'article-reader__media')
      const frame = make('div', 'article-reader__frame')
      const image = make('img')
      image.src = block.src
      image.alt = block.alt || ''
      image.loading = 'lazy'
      frame.append(image)
      figure.append(frame)
      if (block.alt) figure.append(make('figcaption', '', block.alt))
      return figure
    }
    case 'video': {
      const figure = make('figure', 'article-reader__media')
      const frame = make('div', 'article-reader__frame')
      const video = make('video')
      video.src = block.src
      video.controls = false
      video.preload = 'metadata'
      video.playsInline = true
      if (block.loop) {
        video.loop = true
        video.autoplay = true
        video.muted = true
      }
      frame.append(video)
      figure.append(frame)
      if (block.alt) figure.append(make('figcaption', '', block.alt))
      return figure
    }
    case 'embed':
      return richSpacer(block, Number(block.height) || 214, block.title || block.label || 'Interactive integration')
    case 'note':
      return make('aside', 'article-reader__note', block.body || '')
    case 'figure': {
      const pre = make('pre', 'article-reader__code article-reader__code--figure')
      pre.textContent = [block.cols, block.body].filter(Boolean).join('\n')
      return pre
    }
    case 'hero':
      return richSpacer(block, Number(block.height) || 242, block.title || block.eyebrow || 'Project hero')
    case 'media':
      return richSpacer(block, clampMediaHeight(block.height) + mediaGap(block.gap), block.label || 'Project media')
    case 'facts': {
      const count = countRows(block)
      const cols = Math.max(1, Math.min(3, Number(block.columns) || 2))
      return richSpacer(block, Math.max(72, Math.ceil(count / cols) * 58 + 14), block.label || 'Project facts')
    }
    case 'system': {
      const count = countRows(block)
      const cols = Math.max(1, Math.min(2, Number(block.columns) || 2))
      return richSpacer(block, Math.max(98, Math.ceil(count / cols) * 78 + 20), block.label || 'System overview')
    }
    case 'pipeline': {
      const count = countRows(block)
      return richSpacer(block, Math.max(88, count * 42 + 18), block.label || 'System pipeline')
    }
    case 'gallery': {
      const count = countRows(block)
      const cols = Math.max(1, Math.min(3, Number(block.columns) || 2))
      return richSpacer(block, Math.max(166, Math.ceil(count / cols) * 146 + 20), block.label || 'Project gallery')
    }
    case 'timeline': {
      const count = countRows(block)
      return richSpacer(block, Math.max(82, count * 34 + 22), block.label || 'Project timeline')
    }
    case 'compare':
      return richSpacer(block, 224, block.label || 'Before and after comparison')
    case 'model3d':
      return richSpacer(block, 248, block.label || block.title || 'Interactive 3D model')
    default:
      return null
  }
}

let currentId = null

export function syncArticleReader(item) {
  const reader = document.getElementById('article-reader')
  if (!reader) return
  if (!item) {
    reader.hidden = true
    reader.setAttribute('aria-hidden', 'true')
    currentId = null
    return
  }

  reader.hidden = false
  reader.setAttribute('aria-hidden', 'false')
  if (currentId === item.id) return
  currentId = item.id
  reader.replaceChildren()

  const header = make('header', 'article-reader__header')
  header.append(make('p', 'article-reader__eyebrow', 'DOCUMENT / LOCAL ARCHIVE'))
  header.append(make('h1', 'article-reader__title', item.label))
  if (item.sub) header.append(make('p', 'article-reader__sub', item.sub))
  reader.append(header)

  for (const block of item.blocks || []) {
    const node = renderBlock(block)
    if (node) reader.append(node)
  }
  reader.scrollTop = 0
}

export function articleReaderScroll(command) {
  const reader = document.getElementById('article-reader')
  if (!reader || reader.hidden) return false
  const page = Math.max(120, reader.clientHeight * 0.82)
  if (command === 'down') reader.scrollBy({ top: page, behavior: 'smooth' })
  if (command === 'up') reader.scrollBy({ top: -page, behavior: 'smooth' })
  if (command === 'home') reader.scrollTo({ top: 0, behavior: 'smooth' })
  if (command === 'end') reader.scrollTo({ top: reader.scrollHeight, behavior: 'smooth' })
  return true
}
