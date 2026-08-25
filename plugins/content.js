/**
 * virtual:content — compiles content/ into a single bundle at build time.
 *
 * WHY A PLUGIN AND NOT A RUNTIME FETCH
 * The screen is a 480x360 canvas rasteriser, not a DOM. There is nothing for
 * a Markdown-to-HTML renderer to render into, and nothing for MDX's component
 * substitution to substitute. What the terminal needs is a list of typed
 * blocks it can lay out into cells. So the parse happens once, here, and ships
 * as data; the runtime never sees Markdown.
 *
 * FORMAT
 * Front matter between --- fences, then a body of blocks separated by blank
 * lines. Three block kinds:
 *
 *   prose      any paragraph
 *   heading    a Markdown heading (# through ######)
 *   directive  ::name{key=value key=value} with an optional body, closed by ::
 *
 * The directive syntax is the extension point. Adding a block type later —
 * a WASM demo, a live benchmark, an embedded shader — means writing one
 * renderer in pages.js and one entry in KNOWN_DIRECTIVES. Nothing about the
 * parser changes, and existing content keeps parsing.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, extname, basename, resolve } from 'node:path'

const VIRTUAL = 'virtual:content'
const RESOLVED = '\0' + VIRTUAL

/** Directives the renderer knows how to lay out. Anything else is a build error
 *  rather than a silent blank on the screen. */
const KNOWN_DIRECTIVES = new Set(['image', 'video', 'figure', 'note', 'embed'])

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
  const re = /([\w-]+)(?:=(?:"([^"]*)"|(\S+)))?/g
  let a
  while ((a = re.exec(spec))) attrs[a[1]] = a[2] ?? a[3] ?? true
  return { name: m[1], attrs }
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
          `Add a renderer in src/pages.js and register it in plugins/content.js.`)
      }
      // A directive with a body is followed immediately by its content and
      // closed with ::. One followed by a blank line is void. Without that
      // rule a void directive scans forward for a terminator that never
      // arrives and swallows the rest of the file — which is exactly what it
      // did to every block after the first ::image.
      const hasBody = i + 1 < lines.length && lines[i + 1].trim() !== ''
      const inner = []
      i++
      if (hasBody) {
        while (i < lines.length && lines[i].trim() !== '::') { inner.push(lines[i]); i++ }
        i++                                      // consume the closing ::
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
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
               '.webp': 'image/webp', '.gif': 'image/gif' }

/**
 * Images are inlined as data URIs so the built page stays one file.
 * Video is not: a clip large enough to be worth showing is large enough to
 * make base64 a bad trade, so videos are referenced from public/media/ and
 * ship alongside. That is the one place the single-file promise bends, and
 * it bends on purpose.
 */
function resolveMedia(blocks, file) {
  for (const b of blocks) {
    if (b.type === 'image') {
      const path = join(MEDIA_DIR, b.src)
      if (!existsSync(path)) {
        throw new Error(`${file}: image not found: ${path}`)
      }
      const mime = MIME[extname(b.src).toLowerCase()]
      if (!mime) throw new Error(`${file}: unsupported image type: ${b.src}`)
      b.src = `data:${mime};base64,${readFileSync(path).toString('base64')}`
    } else if (b.type === 'video') {
      b.src = b.src.startsWith('/') ? b.src : `/media/${b.src}`
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
      // addWatchFile needs ABSOLUTE paths. Given a relative one, Vite treats
      // it as an import specifier of the virtual module and tries to resolve
      // it — which fails outright on Windows, where join() produces
      // "content\\pages\\about.md" and the dev server reports it as a missing
      // import from virtual:content.
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
    /** Editing any .md re-runs the load above and hot-reloads the screen. */
    handleHotUpdate({ file, server }) {
      if (!resolve(file).startsWith(resolve(root))) return   // path separators differ per OS
      const mod = server.moduleGraph.getModuleById(RESOLVED)
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload' })
    },
  }
}
