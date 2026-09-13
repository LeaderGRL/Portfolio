import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(ROOT, 'assets', 'build')
const PORTRAIT_SOURCE = path.join(ROOT, 'assets', 'src', 'portrait-chassis')
const ASSET_PIPELINE = path.join(ROOT, 'tools', 'assets.mjs')

const REQUIRED_WEBP = [
  'bezel.webp',
  'glass-shade.webp',
  'glass-gloss.webp',
  'key-frame.webp',
  'cap-off.webp',
  'cap-on.webp',
  'nameplate.webp',
  'grille.webp',
  'switch-track.webp',
  'switch-thumb.webp',
  'slider-track.webp',
  'slider-thumb.webp',
  'rocker-housing.webp',
  'rocker-paddle.webp',
  'led.webp',
  'chassis-frame-1920.webp',
  'chassis-frame-4k.webp',
  'chassis-frame-mobile.webp',
  'mobile-fill-top.webp',
  'mobile-fill-right.webp',
  'mobile-fill-bottom.webp',
  'mobile-fill-left.webp',
]

function fileIsUsable(file) {
  try {
    return fs.statSync(file).isFile() && fs.statSync(file).size > 0
  } catch {
    return false
  }
}

function expectedPortraitIds() {
  if (!fs.existsSync(PORTRAIT_SOURCE)) return []
  return fs.readdirSync(PORTRAIT_SOURCE)
    .filter(name => /^\d+x\d+\.png$/i.test(name))
    .map(name => name.replace(/\.png$/i, ''))
    .sort()
}

function inspectGeneratedAssets() {
  const missing = []
  const metaPath = path.join(BUILD, 'meta.json')

  for (const filename of REQUIRED_WEBP) {
    if (!fileIsUsable(path.join(BUILD, filename))) missing.push(filename)
  }

  let meta = null
  if (!fileIsUsable(metaPath)) {
    missing.push('meta.json')
  } else {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch {
      missing.push('meta.json (invalid JSON)')
    }
  }

  const portraitIds = expectedPortraitIds()
  for (const id of portraitIds) {
    const filename = `chassis-frame-portrait-${id}.webp`
    if (!fileIsUsable(path.join(BUILD, filename))) missing.push(filename)
  }

  if (meta) {
    if (!meta.chassis) missing.push('meta.json: chassis')
    if (!meta.mobile_chassis) missing.push('meta.json: mobile_chassis')
    if (!meta.landscape_chassis) missing.push('meta.json: landscape_chassis')

    const profileIds = (meta.portrait_chassis?.profiles || [])
      .map(profile => profile.id)
      .sort()
    if (JSON.stringify(profileIds) !== JSON.stringify(portraitIds)) {
      missing.push('meta.json: portrait_chassis profiles')
    }
  }

  return missing
}

let missing = inspectGeneratedAssets()
if (!missing.length) {
  console.log('Generated assets are complete; skipping asset generation.')
  process.exit(0)
}

console.log(`Generated assets are missing or incomplete (${missing.join(', ')}).`)
console.log('Running the asset pipeline before tests...')

const generated = spawnSync(process.execPath, [ASSET_PIPELINE], {
  cwd: ROOT,
  stdio: 'inherit',
})

if (generated.status !== 0) process.exit(generated.status ?? 1)

missing = inspectGeneratedAssets()
if (missing.length) {
  console.error(`Asset generation finished, but required outputs are still missing: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('Generated assets are ready.')
