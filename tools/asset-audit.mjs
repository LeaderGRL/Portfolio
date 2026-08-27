import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = process.cwd()
const TEXT_ROOTS = ['content', 'src', 'tools']
const MEDIA_ROOT = path.join(ROOT, 'public', 'media')
const SOURCE_ROOT = path.join(ROOT, 'assets', 'src')
const REPORT_PATH = path.join(ROOT, 'tmp', 'asset-audit.json')
const MEDIA_EXTENSIONS = new Set([
  '.avif', '.gif', '.jpeg', '.jpg', '.m4v', '.mov', '.mp4', '.png', '.svg', '.webm', '.webp',
])

function walk(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function bytes(file) {
  return fs.statSync(file).size
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

const textFiles = TEXT_ROOTS.flatMap(root => walk(path.join(ROOT, root)))
  .filter(file => /\.(?:js|mjs|json|md|css|html|py)$/i.test(file))
const searchableText = textFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n')

// README files and other documentation may live next to public media but are
// not deployable media assets. Keep them out of media totals/candidates so the
// report only measures files a browser could actually consume as media.
const mediaFiles = walk(MEDIA_ROOT)
  .filter(file => MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase()))
const sourceFiles = walk(SOURCE_ROOT)
const allAudited = [...mediaFiles, ...sourceFiles]

const media = mediaFiles.map(file => ({
  path: rel(file),
  bytes: bytes(file),
  referenced: searchableText.includes('/' + rel(file).replace(/^public\//, '')),
}))

const generatorText = [
  path.join(ROOT, 'tools', 'build_assets.py'),
  path.join(ROOT, 'tools', 'build_chassis.py'),
].filter(fs.existsSync).map(file => fs.readFileSync(file, 'utf8')).join('\n')

const sources = sourceFiles.map(file => ({
  path: rel(file),
  bytes: bytes(file),
  stem: path.basename(file, path.extname(file)),
  directlyNamedByGenerator: generatorText.includes(path.basename(file, path.extname(file))),
}))

const byHash = new Map()
for (const file of allAudited) {
  const hash = sha256(file)
  if (!byHash.has(hash)) byHash.set(hash, [])
  byHash.get(hash).push(rel(file))
}
const duplicateGroups = [...byHash.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([hash, files]) => ({ hash, files }))

const largest = allAudited
  .map(file => ({ path: rel(file), bytes: bytes(file) }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 20)

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    mediaFiles: mediaFiles.length,
    mediaBytes: media.reduce((sum, item) => sum + item.bytes, 0),
    sourceFiles: sourceFiles.length,
    sourceBytes: sources.reduce((sum, item) => sum + item.bytes, 0),
  },
  unreferencedMedia: media.filter(item => !item.referenced),
  sourceReviewCandidates: sources.filter(item => !item.directlyNamedByGenerator),
  duplicateGroups,
  largest,
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n')

const mib = value => (value / 1024 / 1024).toFixed(2)
console.log(`media        : ${report.totals.mediaFiles} files / ${mib(report.totals.mediaBytes)} MiB`)
console.log(`asset sources: ${report.totals.sourceFiles} files / ${mib(report.totals.sourceBytes)} MiB`)
console.log(`unreferenced media candidates : ${report.unreferencedMedia.length}`)
console.log(`source review candidates      : ${report.sourceReviewCandidates.length}`)
console.log(`exact duplicate groups        : ${report.duplicateGroups.length}`)
console.log('\nlargest audited files:')
for (const item of report.largest.slice(0, 10)) console.log(`  ${mib(item.bytes).padStart(7)} MiB  ${item.path}`)
console.log(`\nreport: ${rel(REPORT_PATH)}`)
