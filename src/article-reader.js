/* Rich article surface inside the physical CRT aperture.
 *
 * The raster terminal remains the canonical navigation and accessibility
 * representation. Article detail gets this DOM layer so authored media can
 * retain the semantics a canvas cannot provide: selectable code, native video
 * controls, responsive images, and sandboxed third-party embeds.
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
      const image = make('img')
      image.src = block.src
      image.alt = block.alt || ''
      image.loading = 'lazy'
      figure.append(image)
      if (block.alt) figure.append(make('figcaption', '', block.alt))
      return figure
    }
    case 'video': {
      const figure = make('figure', 'article-reader__media')
      const video = make('video')
      video.src = block.src
      video.controls = true
      video.preload = 'metadata'
      video.playsInline = true
      if (block.loop !== undefined) video.loop = true
      figure.append(video)
      if (block.alt) figure.append(make('figcaption', '', block.alt))
      return figure
    }
    case 'embed': {
      const frame = make('div', 'article-reader__embed')
      const iframe = make('iframe')
      iframe.src = block.src
      iframe.title = block.title || block.label || 'Article integration'
      iframe.loading = 'lazy'
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')
      frame.append(iframe)
      if (block.label) frame.append(make('p', 'article-reader__caption', block.label))
      return frame
    }
    case 'note':
      return make('aside', 'article-reader__note', block.body || '')
    case 'figure': {
      const pre = make('pre', 'article-reader__code article-reader__code--figure')
      pre.textContent = [block.cols, block.body].filter(Boolean).join('\n')
      return pre
    }
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
  header.append(make('p', 'article-reader__eyebrow', 'ARTICLE / LOCAL ARCHIVE'))
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
