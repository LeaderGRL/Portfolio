import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const MAX_HTML_BYTES = 256 * 1024
const MAX_SCRIPT_STYLE_BYTES = 2 * 1024 * 1024

const formatKiB = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(path))
    else files.push(path)
  }

  return files
}

const htmlPath = join(DIST, 'index.html')
const html = await readFile(htmlPath, 'utf8')
const htmlBytes = Buffer.byteLength(html)

const files = await collectFiles(DIST)
const scriptStyleFiles = files.filter((path) => /\.(?:js|css)$/i.test(path))
const scriptStyleBytes = (await Promise.all(
  scriptStyleFiles.map(async (path) => (await stat(path)).size),
)).reduce((sum, size) => sum + size, 0)

const embeddedHeavyAsset = /data:(?:image|font|video|audio)\/[a-z0-9.+-]+;base64,/i.test(html)
const failures = []

if (htmlBytes > MAX_HTML_BYTES) {
  failures.push(`index.html is ${formatKiB(htmlBytes)} (budget ${formatKiB(MAX_HTML_BYTES)})`)
}
if (scriptStyleBytes > MAX_SCRIPT_STYLE_BYTES) {
  failures.push(`JS + CSS is ${formatKiB(scriptStyleBytes)} (budget ${formatKiB(MAX_SCRIPT_STYLE_BYTES)})`)
}
if (embeddedHeavyAsset) {
  failures.push('index.html contains an embedded image/font/audio/video data URI')
}

console.log(`bundle budget: HTML ${formatKiB(htmlBytes)}, JS + CSS ${formatKiB(scriptStyleBytes)}`)

if (failures.length) {
  for (const failure of failures) console.error(`bundle budget failed: ${failure}`)
  process.exitCode = 1
}
