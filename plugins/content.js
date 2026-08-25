/**
 * virtual:content — compiles content/ into a single bundle at build time.
 *
 * The runtime consumes typed document blocks rather than Markdown/HTML. The
 * block vocabulary is shared with the browser through src/document/schema.js,
 * so authoring validation and rendering cannot silently drift apart.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, extname, basename, resolve } from 'node:path'
import { DIRECTIVE_TYPES, getBlockDefinition } from '../src/document/schema.js'

const VIRTUAL = 'virtual:content'
const RESOLVED = '\0' + VIRTUAL
const KNOWN_DIRECTIVES = new Set(DIRECTIVE_TYPES)

function parseFrontMatter(raw) {
  if (!raw.startsWith('---')) return [{}, raw]
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return [{}, raw]
  const head = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\n+/, '')
  const meta = {}
  for (const line of head.split('\n')) {
    const i = line.indexOf(':')
    if (i === -1) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    }
    meta[key] = value
  }
  return [meta, body]
}

/** ::name{a=1 b="two words"} -> { name, attrs } */
function parseDirectiveHead(line) {
  const m = /^::([a-z][\w-]*)\s*(?:\{(.*)\})?\s*$/.exec(line.trim())
  if (!m) return null
  const attrs = {}
  const spec = m[2] || ''
  const re = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
  let a
  while ((a = re.exec(spec))) attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? true
  return { name: m[1], attrs }
}

function parseHtmlAttributes(source) {
  const attrs = {}
  const re = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let match
  while ((match = re.exec(source))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

/** Normalize legacy iframe HTML into the generic embed contract. */
function parseRawIframe(lines, start) {
  if (!/^\s*<iframe\b/i.test(lines[start] || '')) return null
  const html = []
  let i = start
  while (i < lines.length) {
    html.push(lines[i])
    if (/<\/iframe\s*>/i.test(lines[i])) break
    i++
  }
  const markup = html.join('\n')
  const open = /<iframe\b([^>]*)>/i.exec(markup)
  if (!open) return null
  const attrs = parseHtmlAttributes(open[1])
  if (!attrs.src) return null
  return {
    block: {
      type: 'embed',
      provider: 'iframe',
      src: attrs.src,
      title: attrs.title || attrs['aria-label'] || 'Interactive integration',
      width: attrs.width,
      height: attrs.height,
    },
    next: Math.min(lines.length, i + 1),
  }
}

function parseBody(body, file) {
  const blocks = []
  const lines = body.split('\n')
  let i = 0
  let para = []

  const flushPara = () => {
    const text = para.join(' ').trim()
    if (text) blocks.push({ type: 'prose', text })
    para = []
  }

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { flushPara(); i++; continue }

    if (line.startsWith('```')) {
      flushPara()
      const language = line.slice(3).trim()
      const inner = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        inner.push(lines[i]); i++
      }
      if (i < lines.length) i++
      blocks.push({ type: 'code', language, body: inner.join('\n') })
      continue
    }

    const rawIframe = parseRawIframe(lines, i)
    if (rawIframe) {
      flushPara()
      blocks.push(rawIframe.block)
      i = rawIframe.next
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      flushPara()
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }

    if (line.startsWith('- ')) {
      flushPara()
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2).trim()); i++
      }
      blocks.push({ type: 'list', items })
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      flushPara()
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, '').trim()); i++
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    const head = parseDirectiveHead(line)
    if (head) {
      flushPara()
      if (!KNOWN_DIRECTIVES.has(head.name)) {
        throw new Error(
          `${file}: unknown directive "::${head.name}". ` +
          `Register it in src/document/schema.js before using it in content.`)
      }

      const hasBody = i + 1 < lines.length && lines[i + 1].trim() !== ''
      const inner = []
      i++
      if (hasBody) {
        while (i < lines.length && lines[i].trim() !== '::') { inner.push(lines[i]); i++ }
        if (i < lines.length) i++
      }
      blocks.push({ type: head.name, ...head.attrs, body: inner.join('\n').trim() })
      continue
    }

    para.push(line.trim())
    i++
  }
  flushPara()
  return blocks
}

const MEDIA_DIR = 'content/media'
const INLINE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const isExternal = value => /^(?:data:|https?:|\/)/i.test(String(value || ''))

function resolveRasterAsset(value, file) {
  if (!value || isExternal(value)) return value
  const path = join(MEDIA_DIR, value)
  if (!existsSync(path)) throw new Error(`${file}: media not found: ${path}`)
  const mime = INLINE_MIME[extname(value).toLowerCase()]
  if (!mime) return value
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

function resolveMedia(blocks, file) {
  for (const block of blocks) {
    const definition = getBlockDefinition(block.type)
    for (const field of definition?.assetFields || []) {
      const value = block[field]
      if (!value) continue

      // Raster images/GIFs are kept inside the single-file build. Large live
      // media and 3D files remain URL assets; the runtime adapters own them.
      const ext = extname(String(value).split(/[?#]/)[0]).toLowerCase()
      if (INLINE_MIME[ext]) block[field] = resolveRasterAsset(value, file)
      else if (block.type === 'video' && field === 'src' && !isExternal(value)) {
        block[field] = `/media/${value}`
      }
    }
  }
  return blocks
}

function readCollection(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => extname(f) === '.md')
    .sort()
    .map(f => {
      const path = join(dir, f)
      const [meta, body] = parseFrontMatter(readFileSync(path, 'utf8'))
      return { id: basename(f, '.md'), ...meta, blocks: resolveMedia(parseBody(body, path), path) }
    })
}

export default function contentPlugin(root = 'content') {
  let watched = []
  return {
    name: 'jg1500-content',
    resolveId(id) { return id === VIRTUAL ? RESOLVED : null },
    load(id) {
      if (id !== RESOLVED) return null
      const site = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8'))
      const bundle = {
        ...site,
        pages: Object.fromEntries(readCollection(join(root, 'pages')).map(p => [p.id, p])),
        projects: readCollection(join(root, 'projects')),
        articles: readCollection(join(root, 'articles')),
      }
      watched = []
      for (const d of ['pages', 'projects', 'articles']) {
        const dir = join(root, d)
        if (!existsSync(dir)) continue
        for (const f of readdirSync(dir)) watched.push(resolve(dir, f))
      }
      watched.push(resolve(root, 'site.json'))
      watched.forEach(f => this.addWatchFile(f))
      return `export default ${JSON.stringify(bundle)}`
    },
    handleHotUpdate({ file, server }) {
      if (!resolve(file).startsWith(resolve(root))) return
      const mod = server.moduleGraph.getModuleById(RESOLVED)
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload' })
    },
  }
}
