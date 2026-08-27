import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const CONTENT_ROOT = path.join(ROOT, 'content')
const TEMPLATE_PATH = path.join(ROOT, 'nginx.conf')
const DIST_HTML_PATH = path.join(ROOT, 'dist', 'index.html')
const OUTPUT_PATH = path.join(ROOT, 'dist', 'nginx.conf')

const BASE_TITLE = 'Jordan Grilly — Systems / Performance / Architecture'
const BASE_DESCRIPTION = 'Portfolio of Jordan Grilly, systems and performance engineer.'

const SEO_ANCHORS = [
  {
    pattern: /<title>[^<]*<\/title>/i,
    value: `<title>${BASE_TITLE}</title>`,
  },
  {
    pattern: /<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i,
    value: `<meta name="description" content="${BASE_DESCRIPTION}">`,
  },
  {
    pattern: /<meta\b(?=[^>]*\bproperty=["']og:title["'])[^>]*>/i,
    value: `<meta property="og:title" content="${BASE_TITLE}">`,
  },
  {
    pattern: /<meta\b(?=[^>]*\bproperty=["']og:description["'])[^>]*>/i,
    value: `<meta property="og:description" content="${BASE_DESCRIPTION}">`,
  },
  {
    pattern: /<meta\b(?=[^>]*\bproperty=["']og:type["'])[^>]*>/i,
    value: '<meta property="og:type" content="website">',
  },
  {
    pattern: /<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*>/i,
    value: '<meta property="og:url" content="/">',
  },
  {
    pattern: /<meta\b(?=[^>]*\bname=["']twitter:title["'])[^>]*>/i,
    value: `<meta name="twitter:title" content="${BASE_TITLE}">`,
  },
  {
    pattern: /<meta\b(?=[^>]*\bname=["']twitter:description["'])[^>]*>/i,
    value: `<meta name="twitter:description" content="${BASE_DESCRIPTION}">`,
  },
  {
    pattern: /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i,
    value: '<link rel="canonical" href="/">',
  },
]

function parseFrontMatter(raw) {
  if (!raw.startsWith('---')) return {}
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return {}
  const meta = {}
  for (const line of raw.slice(3, end).trim().split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return meta
}

function readCollection(root) {
  if (!fs.existsSync(root)) return []
  const out = []
  for (const entry of fs.readdirSync(root).sort()) {
    const full = path.join(root, entry)
    const stat = fs.statSync(full)
    if (stat.isFile() && path.extname(entry) === '.md') {
      out.push({ id: path.basename(entry, '.md'), ...parseFrontMatter(fs.readFileSync(full, 'utf8')) })
    } else if (stat.isDirectory()) {
      const index = path.join(full, 'index.md')
      if (fs.existsSync(index)) out.push({ id: entry, ...parseFrontMatter(fs.readFileSync(index, 'utf8')) })
    }
  }
  return out
}

function html(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function nginx(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeDistSeoAnchors() {
  let builtHtml = fs.readFileSync(DIST_HTML_PATH, 'utf8')

  for (const anchor of SEO_ANCHORS) {
    if (anchor.pattern.test(builtHtml)) {
      builtHtml = builtHtml.replace(anchor.pattern, anchor.value)
      continue
    }

    // The source template should contain every anchor. If a future Vite/plugin
    // version removes one entirely, reinsert it before </head> rather than
    // silently shipping a route that Nginx cannot customize.
    if (!builtHtml.includes('</head>')) throw new Error('dist/index.html has no closing head element')
    builtHtml = builtHtml.replace('</head>', `${anchor.value}</head>`)
  }

  fs.writeFileSync(DIST_HTML_PATH, builtHtml)
}

const routes = new Map([
  ['/', { title: BASE_TITLE, description: BASE_DESCRIPTION, type: 'website' }],
  ['/about', { title: 'About — Jordan Grilly', description: `About — ${BASE_DESCRIPTION}`, type: 'website' }],
  ['/resume', { title: 'Resume — Jordan Grilly', description: `Resume — ${BASE_DESCRIPTION}`, type: 'website' }],
  ['/projects', { title: 'Projects — Jordan Grilly', description: `Projects — ${BASE_DESCRIPTION}`, type: 'website' }],
  ['/articles', { title: 'Articles — Jordan Grilly', description: `Articles — ${BASE_DESCRIPTION}`, type: 'website' }],
  ['/contact', { title: 'Contact — Jordan Grilly', description: `Contact — ${BASE_DESCRIPTION}`, type: 'website' }],
])

for (const [section, documents] of [
  ['projects', readCollection(path.join(CONTENT_ROOT, 'projects'))],
  ['articles', readCollection(path.join(CONTENT_ROOT, 'articles'))],
]) {
  for (const item of documents) {
    routes.set(`/${section}/${encodeURIComponent(item.id)}`, {
      title: `${item.title || item.id} — Jordan Grilly`,
      description: item.sub || `${item.title || item.id} — ${BASE_DESCRIPTION}`,
      type: section === 'articles' ? 'article' : 'website',
    })
  }
}

// $request_uri always keeps the browser's original request, even when
// try_files internally falls back to /index.html. Normalize it once into a
// query-free stable path and drive every SEO map from that path.
function pathMap() {
  const lines = ['map $request_uri $seo_path {', '    default "/";']
  for (const route of routes.keys()) {
    const pattern = regexEscape(route)
    lines.push(`    ~^${pattern}(?:\\?.*)?$ "${nginx(route)}";`)
  }
  lines.push('}')
  return lines.join('\n')
}

function mapBlock(variable, field, fallback) {
  const lines = [`map $seo_path $${variable} {`, `    default "${nginx(html(fallback))}";`]
  for (const [route, meta] of routes) {
    const value = meta[field] || fallback
    lines.push(`    "${nginx(route)}" "${nginx(html(value))}";`)
  }
  lines.push('}')
  return lines.join('\n')
}

const maps = [
  pathMap(),
  mapBlock('seo_title', 'title', BASE_TITLE),
  mapBlock('seo_description', 'description', BASE_DESCRIPTION),
  mapBlock('seo_type', 'type', 'website'),
].join('\n\n')

const filters = `        set $seo_url "$scheme://$host$seo_path";\n\n` +
`        sub_filter_once off;\n` +
`        sub_filter '<title>${BASE_TITLE}</title>' '<title>$seo_title</title>';\n` +
`        sub_filter '<meta name="description" content="${BASE_DESCRIPTION}">' '<meta name="description" content="$seo_description">';\n` +
`        sub_filter '<meta property="og:title" content="${BASE_TITLE}">' '<meta property="og:title" content="$seo_title">';\n` +
`        sub_filter '<meta property="og:description" content="${BASE_DESCRIPTION}">' '<meta property="og:description" content="$seo_description">';\n` +
`        sub_filter '<meta property="og:type" content="website">' '<meta property="og:type" content="$seo_type">';\n` +
`        sub_filter '<meta property="og:url" content="/">' '<meta property="og:url" content="$seo_url">';\n` +
`        sub_filter '<meta name="twitter:title" content="${BASE_TITLE}">' '<meta name="twitter:title" content="$seo_title">';\n` +
`        sub_filter '<meta name="twitter:description" content="${BASE_DESCRIPTION}">' '<meta name="twitter:description" content="$seo_description">';\n` +
`        sub_filter '<link rel="canonical" href="/">' '<link rel="canonical" href="$seo_url">';`

normalizeDistSeoAnchors()

const template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
if (!template.includes('# SEO_MAPS_GENERATED_HERE') || !template.includes('# SEO_SUB_FILTERS_GENERATED_HERE')) {
  throw new Error('nginx.conf is missing SEO generation markers')
}

const output = template
  .replace('# SEO_MAPS_GENERATED_HERE', maps)
  .replace('# SEO_SUB_FILTERS_GENERATED_HERE', filters)

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
fs.writeFileSync(OUTPUT_PATH, output)
console.log(`normalized static SEO anchors and generated route-aware config for ${routes.size} routes -> ${path.relative(ROOT, OUTPUT_PATH)}`)
