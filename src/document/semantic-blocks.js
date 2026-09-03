/* ========================================================================== *
 * Rich block semantic mirror
 *
 * Visible pixels remain rasterised through the physical CRT. These nodes only
 * provide meaningful document structure, links, alternative text and values
 * to assistive technology while preserving the exact raster scroll geometry.
 * ========================================================================== */

const make = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const rows = body => String(body || '')
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => {
    const [value, ...rest] = line.split('|').map(part => part.trim())
    return { value, label: rest.join(' | ') }
  })

function fixedSection(block, height, label) {
  const section = make('section', 'article-reader__rich-spacer')
  section.style.height = `${height}px`
  section.style.minHeight = `${height}px`
  section.style.overflow = 'hidden'
  section.dataset.blockType = block.type
  if (label) section.setAttribute('aria-label', label)
  return section
}

function appendImage(parent, src, alt = '') {
  if (!src) return null
  const image = make('img')
  image.src = src
  image.alt = alt
  image.loading = 'lazy'
  parent.append(image)
  return image
}

function appendDefinitionRows(section, items) {
  const list = make('dl', 'article-reader__semantic-list')
  for (const item of items) {
    list.append(make('dt', '', item.value || 'Item'))
    list.append(make('dd', '', item.label || ''))
  }
  section.append(list)
}

function appendTimeline(section, items) {
  const list = make('ol', 'article-reader__semantic-list')
  for (const item of items) {
    const entry = make('li')
    if (item.value) entry.append(make('strong', '', `${item.value} `))
    entry.append(document.createTextNode(item.label || ''))
    list.append(entry)
  }
  section.append(list)
}

function appendGallery(section, block) {
  for (const item of rows(block.body)) {
    const figure = make('figure')
    appendImage(figure, item.value, item.label || 'Project illustration')
    if (item.label) figure.append(make('figcaption', '', item.label))
    section.append(figure)
  }
}

function semanticHeight(block) {
  const count = rows(block.body).length
  switch (block.type) {
    case 'hero': return Number(block.height) || 242
    case 'media': {
      const value = Math.max(150, Math.min(340, Number(block.height) || 246))
      const gap = Number.isFinite(Number(block.gap)) ? Math.max(12, Math.min(48, Number(block.gap))) : 24
      return value + gap
    }
    case 'audio': return Math.max(88, Math.min(150, Number(block.height) || 104))
    case 'facts': return Math.max(72, Math.ceil(count / Math.max(1, Math.min(3, Number(block.columns) || 2))) * 58 + 14)
    case 'system': return Math.max(98, Math.ceil(count / Math.max(1, Math.min(2, Number(block.columns) || 2))) * 78 + 20)
    case 'pipeline': return Math.max(88, count * 42 + 18)
    case 'gallery': return Math.max(166, Math.ceil(count / Math.max(1, Math.min(3, Number(block.columns) || 2))) * 146 + 20)
    case 'timeline': return Math.max(82, count * 34 + 22)
    case 'compare': return 224
    case 'model3d': return 248
    case 'embed': return Number(block.height) || 214
    default: return 120
  }
}

export function renderRichSemanticBlock(block) {
  if (!block) return null
  const height = semanticHeight(block)

  if (block.type === 'hero') {
    const section = fixedSection(block, height, block.title || block.eyebrow || 'Project hero')
    appendImage(section, block.media || block.poster, block.alt || block.title || '')
    if (block.eyebrow || block.kicker) section.append(make('p', '', block.eyebrow || block.kicker))
    if (block.title) section.append(make('h2', '', block.title))
    if (block.subtitle) section.append(make('p', '', block.subtitle))
    return section
  }

  if (block.type === 'facts' || block.type === 'system' || block.type === 'pipeline') {
    const section = fixedSection(block, height, block.label || `${block.type} information`)
    if (block.label) section.append(make('h3', '', block.label))
    appendDefinitionRows(section, rows(block.body))
    return section
  }

  if (block.type === 'audio') {
    const label = block.label || block.title || 'Audio track'
    const section = fixedSection(block, height, label)
    section.append(make('h3', '', label))
    if (block.credit) section.append(make('p', '', block.credit))
    section.append(make('p', '', 'Interactive audio preview. Use the player control shown on the CRT when this block is visible.'))
    return section
  }

  if (block.type === 'gallery') {
    const section = fixedSection(block, height, block.label || 'Project gallery')
    appendGallery(section, block)
    return section
  }

  if (block.type === 'timeline') {
    const section = fixedSection(block, height, block.label || 'Project timeline')
    appendTimeline(section, rows(block.body))
    return section
  }

  if (block.type === 'compare') {
    const section = fixedSection(block, height, block.label || 'Before and after comparison')
    const before = make('figure')
    appendImage(before, block.before, block.beforeLabel || 'Before')
    before.append(make('figcaption', '', block.beforeLabel || 'Before'))
    const after = make('figure')
    appendImage(after, block.after, block.afterLabel || 'After')
    after.append(make('figcaption', '', block.afterLabel || 'After'))
    section.append(before, after)
    return section
  }

  if (block.type === 'media') {
    const section = fixedSection(block, height, block.label || 'Project media')
    const figure = make('figure')
    appendImage(figure, block.src, block.alt || block.label || 'Project media')
    if (block.label) figure.append(make('figcaption', '', block.label))
    section.append(figure)
    return section
  }

  if (block.type === 'model3d') {
    const label = block.label || block.title || 'Interactive 3D model'
    const section = fixedSection(block, height, label)
    section.append(make('h3', '', label))
    appendImage(section, block.poster, `${label} fallback preview`)
    section.append(make('p', '', 'Interactive 3D model. A static preview is available when 3D rendering is unsupported.'))
    return section
  }

  if (block.type === 'embed') {
    const label = block.title || block.label || 'Interactive integration'
    const section = fixedSection(block, height, label)
    section.append(make('h3', '', label))
    appendImage(section, block.poster, `${label} preview`)
    if (block.src) {
      const anchor = make('a', 'article-reader__link', `Open ${label}`)
      anchor.href = block.src
      anchor.target = '_blank'
      anchor.rel = 'noreferrer noopener'
      section.append(anchor)
    }
    return section
  }

  return null
}
