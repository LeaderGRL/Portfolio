import { renderRichSemanticBlock } from './document/semantic-blocks.js'

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
const GENERIC_IMAGE_ALT = /^(?:article illustration|project illustration|illustration|image)$/i
const VISUAL_BLOCK_TYPES = new Set(['image', 'media', 'hero'])

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

let volumeObserver = null
let observedVolumeControl = null
let mediaLifecycleBound = false
let powerObserver = null

function panelMediaVolume() {
  const control = document.getElementById('volume')
  const value = Number(control?.getAttribute('aria-valuenow'))
  if (!Number.isFinite(value)) return 0.35
  return Math.max(0, Math.min(1, value / 100))
}

function syncPanelMediaVolume(reader = document.getElementById('article-reader')) {
  if (!reader) return
  const volume = panelMediaVolume()
  for (const video of reader.querySelectorAll('video')) video.volume = volume
}

export function pauseArticleMedia(reader = document.getElementById('article-reader')) {
  if (!reader) return
  for (const video of reader.querySelectorAll('video')) {
    if (!video.paused) video.pause()
  }
}

function bindPanelMediaVolume() {
  const control = document.getElementById('volume')
  if (!control || observedVolumeControl === control) return

  volumeObserver?.disconnect()
  observedVolumeControl = control
  volumeObserver = new MutationObserver(() => syncPanelMediaVolume())
  volumeObserver.observe(control, {
    attributes: true,
    attributeFilter: ['aria-valuenow'],
  })
}

function bindMediaLifecycle() {
  if (mediaLifecycleBound) return
  mediaLifecycleBound = true

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseArticleMedia()
  })
  addEventListener('pagehide', () => pauseArticleMedia())

  const tube = document.getElementById('tube')
  if (tube) {
    powerObserver = new MutationObserver(() => {
      if (tube.classList.contains('is-powered-off')) pauseArticleMedia()
    })
    powerObserver.observe(tube, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }
}

function renderBlock(block) {
  const rich = renderRichSemanticBlock(block)
  if (rich) return rich

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
      video.preload = 'none'
      video.playsInline = true
      video.volume = panelMediaVolume()
      if (block.loop) {
        video.loop = true
        video.autoplay = true
        video.muted = true
        video.preload = 'auto'
      }
      frame.append(video)
      figure.append(frame)
      if (block.alt) figure.append(make('figcaption', '', block.alt))
      return figure
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

function accessibleBlock(block, context) {
  if (!VISUAL_BLOCK_TYPES.has(block.type)) return block
  const alt = String(block.alt || '').trim()
  if (alt && !GENERIC_IMAGE_ALT.test(alt)) return block

  const label = String(block.label || block.title || '').trim()
  const meaningfulLabel = label && !GENERIC_IMAGE_ALT.test(label) ? label : ''
  return {
    ...block,
    alt: meaningfulLabel || `${context || 'Technical article'} — technical illustration`,
  }
}

let currentId = null

export function syncArticleReader(item) {
  const reader = document.getElementById('article-reader')
  if (!reader) return

  bindPanelMediaVolume()
  bindMediaLifecycle()

  if (!item) {
    pauseArticleMedia(reader)
    reader.hidden = true
    reader.setAttribute('aria-hidden', 'true')
    currentId = null
    return
  }

  reader.hidden = false
  reader.setAttribute('aria-hidden', 'false')
  if (currentId === item.id) {
    syncPanelMediaVolume(reader)
    return
  }

  pauseArticleMedia(reader)
  currentId = item.id
  reader.replaceChildren()

  const header = make('header', 'article-reader__header')
  header.append(make('p', 'article-reader__eyebrow', 'DOCUMENT / LOCAL ARCHIVE'))
  header.append(make('h1', 'article-reader__title', item.label))
  if (item.sub) header.append(make('p', 'article-reader__sub', item.sub))
  if (item.link) {
    const source = make('a', 'article-reader__link', 'Open project source / primary link')
    source.href = item.link
    source.target = '_blank'
    source.rel = 'noreferrer noopener'
    header.append(source)
  }
  reader.append(header)

  let context = item.label
  for (const block of item.blocks || []) {
    if (block.type === 'heading' && block.text) context = block.text
    const node = renderBlock(accessibleBlock(block, context))
    if (node) reader.append(node)
  }
  syncPanelMediaVolume(reader)
  reader.scrollTop = 0
}

export function articleReaderScroll(command) {
  const reader = document.getElementById('article-reader')
  if (!reader || reader.hidden) return false
  const page = Math.max(120, reader.clientHeight * 0.82)
  const line = Math.max(28, reader.clientHeight * 0.08)
  if (command === 'line-down') reader.scrollBy({ top: line, behavior: 'smooth' })
  if (command === 'line-up') reader.scrollBy({ top: -line, behavior: 'smooth' })
  if (command === 'down') reader.scrollBy({ top: page, behavior: 'smooth' })
  if (command === 'up') reader.scrollBy({ top: -page, behavior: 'smooth' })
  if (command === 'home') reader.scrollTo({ top: 0, behavior: 'smooth' })
  if (command === 'end') reader.scrollTo({ top: reader.scrollHeight, behavior: 'smooth' })
  return true
}
