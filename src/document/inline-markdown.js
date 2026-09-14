const INLINE_TOKEN = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g
const LINK_TOKEN = /^\[([^\]]+)\]\(([^)]+)\)$/

export function parseInlineMarkdown(value = '') {
  const source = String(value)
  const tokens = []
  let cursor = 0

  for (const match of source.matchAll(INLINE_TOKEN)) {
    if (match.index > cursor) {
      tokens.push({ type: 'text', text: source.slice(cursor, match.index) })
    }

    const raw = match[0]
    const link = LINK_TOKEN.exec(raw)
    if (link) {
      tokens.push({ type: 'link', text: link[1], href: link[2] })
    } else if (raw.startsWith('**') || raw.startsWith('__')) {
      tokens.push({ type: 'strong', text: raw.slice(2, -2) })
    } else if (raw.startsWith('`')) {
      tokens.push({ type: 'code', text: raw.slice(1, -1) })
    } else {
      tokens.push({ type: 'em', text: raw.slice(1, -1) })
    }
    cursor = match.index + raw.length
  }

  if (cursor < source.length) tokens.push({ type: 'text', text: source.slice(cursor) })
  const text = source
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')

  return { tokens, text }
}
