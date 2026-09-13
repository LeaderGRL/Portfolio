import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const KiB = 1024
const BUDGETS = Object.freeze({
  html: 16 * KiB,
  initialJs: 384 * KiB,
  lazyJs: 640 * KiB,
  lazyChunk: 640 * KiB,
  css: 64 * KiB,
  fonts: 160 * KiB,
  criticalAssets: 320 * KiB,
  criticalAsset: 256 * KiB,
})

const formatKiB = (bytes) => `${(bytes / KiB).toFixed(1)} KiB`

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path))
      continue
    }

    files.push({
      path,
      url: `/${relative(DIST, path).replaceAll('\\', '/')}`,
      size: (await stat(path)).size,
    })
  }

  return files
}

function tagAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] || null
}

function localDistUrl(value) {
  if (!value || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) return null
  const pathname = value.split(/[?#]/, 1)[0]
  if (!pathname) return null
  const decoded = decodeURIComponent(pathname)
  return decoded.startsWith('/') ? decoded : `/${decoded.replace(/^\.\//, '')}`
}

function uniqueFilesFromTags(tags, attribute, fileByUrl, failures, label) {
  const urls = new Set(tags.map(tag => localDistUrl(tagAttribute(tag, attribute))).filter(Boolean))
  const files = []

  for (const url of urls) {
    const file = fileByUrl.get(url)
    if (!file) {
      failures.push(`${label} references missing output ${url}`)
      continue
    }
    files.push(file)
  }

  return files
}

function totalBytes(files) {
  return files.reduce((sum, file) => sum + file.size, 0)
}

function largestBytes(files) {
  return files.reduce((largest, file) => Math.max(largest, file.size), 0)
}

function enforceBudget(failures, label, bytes, budget) {
  if (bytes > budget) {
    failures.push(`${label} is ${formatKiB(bytes)} (budget ${formatKiB(budget)})`)
  }
}

const htmlPath = join(DIST, 'index.html')
const html = await readFile(htmlPath, 'utf8')
const htmlBytes = Buffer.byteLength(html)
const files = await collectFiles(DIST)
const fileByUrl = new Map(files.map(file => [file.url, file]))
const failures = []

const moduleScriptTags = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*>/gi)].map(match => match[0])
const modulePreloadTags = [...html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi)].map(match => match[0])
const initialJsFiles = [
  ...uniqueFilesFromTags(moduleScriptTags, 'src', fileByUrl, failures, 'module script'),
  ...uniqueFilesFromTags(modulePreloadTags, 'href', fileByUrl, failures, 'module preload'),
]
const initialJsPaths = new Set(initialJsFiles.map(file => file.path))
const jsFiles = files.filter(file => /\.js$/i.test(file.path))
const lazyJsFiles = jsFiles.filter(file => !initialJsPaths.has(file.path))
const cssFiles = files.filter(file => /\.css$/i.test(file.path))
const fontFiles = files.filter(file => /\.(?:woff2?|ttf|otf)$/i.test(file.path))

const preloadTags = [...html.matchAll(/<link\b[^>]*\brel=["']preload["'][^>]*>/gi)].map(match => match[0])
const criticalImageTags = preloadTags.filter(tag => /\bas=["']image["']/i.test(tag))
const criticalAssetFiles = uniqueFilesFromTags(
  criticalImageTags,
  'href',
  fileByUrl,
  failures,
  'critical image preload',
)

const initialJsBytes = totalBytes(initialJsFiles)
const lazyJsBytes = totalBytes(lazyJsFiles)
const lazyChunkBytes = largestBytes(lazyJsFiles)
const cssBytes = totalBytes(cssFiles)
const fontBytes = totalBytes(fontFiles)
const criticalAssetBytes = totalBytes(criticalAssetFiles)
const criticalAssetMaxBytes = largestBytes(criticalAssetFiles)

if (!initialJsFiles.length) failures.push('index.html does not reference an initial module JavaScript entry')

enforceBudget(failures, 'HTML', htmlBytes, BUDGETS.html)
enforceBudget(failures, 'initial JS', initialJsBytes, BUDGETS.initialJs)
enforceBudget(failures, 'lazy JS total', lazyJsBytes, BUDGETS.lazyJs)
enforceBudget(failures, 'largest lazy JS chunk', lazyChunkBytes, BUDGETS.lazyChunk)
enforceBudget(failures, 'CSS', cssBytes, BUDGETS.css)
enforceBudget(failures, 'fonts', fontBytes, BUDGETS.fonts)
enforceBudget(failures, 'critical image preloads total', criticalAssetBytes, BUDGETS.criticalAssets)
enforceBudget(failures, 'largest critical image preload', criticalAssetMaxBytes, BUDGETS.criticalAsset)

const embeddedHeavyAsset = /data:(?:image|font|video|audio)\/[a-z0-9.+-]+;base64,/i.test(html)
if (embeddedHeavyAsset) {
  failures.push('index.html contains an embedded image/font/audio/video data URI')
}

const moduleScriptIndex = html.search(/<script\b[^>]*\btype=["']module["']/i)
const criticalChassisPreloads = [
  {
    label: '1920 chassis',
    asset: /\/assets\/chassis-frame-1920-[^"']+\.webp/i,
    media: '(min-aspect-ratio: 21/20) and (max-width: 2559px) and (pointer: fine)',
  },
  {
    label: '4K chassis',
    asset: /\/assets\/chassis-frame-4k-[^"']+\.webp/i,
    media: '(min-aspect-ratio: 21/20) and (min-width: 2560px) and (pointer: fine)',
  },
]

for (const expected of criticalChassisPreloads) {
  const match = [...html.matchAll(/<link\b[^>]*\brel=["']preload["'][^>]*>/gi)]
    .find(({ 0: tag }) => expected.asset.test(tag))
  const tag = match?.[0] || ''

  if (!match) {
    failures.push(`${expected.label} is not discoverable from an image preload in index.html`)
    continue
  }
  if (!/\bas=["']image["']/i.test(tag) || !/\btype=["']image\/webp["']/i.test(tag)) {
    failures.push(`${expected.label} preload is missing its image/WebP resource type`)
  }
  if (!/\bfetchpriority=["']high["']/i.test(tag)) {
    failures.push(`${expected.label} preload is not marked high priority`)
  }
  if (!tag.includes(`media="${expected.media}"`)) {
    failures.push(`${expected.label} preload lost its responsive media guard`)
  }
  if (moduleScriptIndex >= 0 && (match.index ?? Infinity) > moduleScriptIndex) {
    failures.push(`${expected.label} preload appears after the JavaScript entry module`)
  }
}

const report = [
  ['HTML', htmlBytes, BUDGETS.html, 1],
  ['initial JS', initialJsBytes, BUDGETS.initialJs, initialJsFiles.length],
  ['lazy JS total', lazyJsBytes, BUDGETS.lazyJs, lazyJsFiles.length],
  ['largest lazy JS chunk', lazyChunkBytes, BUDGETS.lazyChunk, lazyJsFiles.length ? 1 : 0],
  ['CSS', cssBytes, BUDGETS.css, cssFiles.length],
  ['fonts', fontBytes, BUDGETS.fonts, fontFiles.length],
  ['critical image preloads total', criticalAssetBytes, BUDGETS.criticalAssets, criticalAssetFiles.length],
  ['largest critical image preload', criticalAssetMaxBytes, BUDGETS.criticalAsset, criticalAssetFiles.length ? 1 : 0],
]

console.log('bundle budget:')
for (const [label, bytes, budget, count] of report) {
  console.log(`  ${label}: ${formatKiB(bytes)} / ${formatKiB(budget)} (${count} file${count === 1 ? '' : 's'})`)
}

if (failures.length) {
  for (const failure of failures) console.error(`bundle budget failed: ${failure}`)
  process.exitCode = 1
}
