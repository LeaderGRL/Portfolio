import fs from 'node:fs'
import path from 'node:path'
import { DIRECTIVE_TYPES, getBlockDefinition, normalizeProvider } from '../src/document/schema.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(66)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const readWebpSize = filePath => {
  const data = fs.readFileSync(filePath)
  if (
    data.length < 30 ||
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== 'WEBP'
  ) return null

  let offset = 12
  while (offset + 8 <= data.length) {
    const type = data.toString('ascii', offset, offset + 4)
    const chunkSize = data.readUInt32LE(offset + 4)
    const payload = offset + 8

    if (type === 'VP8 ' && payload + 10 <= data.length) {
      if (
        data[payload + 3] === 0x9d &&
        data[payload + 4] === 0x01 &&
        data[payload + 5] === 0x2a
      ) {
        return {
          width: data.readUInt16LE(payload + 6) & 0x3fff,
          height: data.readUInt16LE(payload + 8) & 0x3fff,
        }
      }
    }

    if (type === 'VP8L' && payload + 5 <= data.length && data[payload] === 0x2f) {
      const bits = data.readUInt32LE(payload + 1)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      }
    }

    if (type === 'VP8X' && payload + 10 <= data.length) {
      return {
        width: data.readUIntLE(payload + 4, 3) + 1,
        height: data.readUIntLE(payload + 7, 3) + 1,
      }
    }

    offset = payload + chunkSize + (chunkSize & 1)
  }

  return null
}

const parseAttributes = directive => Object.fromEntries(
  [...directive.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
)

const audioBlocks = fs.readFileSync('src/document/audio-blocks.js', 'utf8')
const audioPlayback = fs.readFileSync('src/document/audio-playback-manager.js', 'utf8')
const bridge = fs.readFileSync('src/article-crt-bridge.js', 'utf8')
const semantic = fs.readFileSync('src/document/semantic-blocks.js', 'utf8')
const mediaBlocks = fs.readFileSync('src/document/media-blocks.js', 'utf8')
const integrations = fs.readFileSync('src/document/default-integrations.js', 'utf8')
const astro = fs.readFileSync('content/projects/astro/index.md', 'utf8')

const audioDefinition = getBlockDefinition('audio')
check(Boolean(audioDefinition), 'schema exposes audio block')
check(audioDefinition?.interactive === true, 'audio block is interactive')
check(DIRECTIVE_TYPES.includes('audio'), 'audio is authorable as a directive')
check(normalizeProvider({ type: 'audio' }) === 'audio', 'audio resolves to reusable audio provider')

check(audioPlayback.includes('export class AudioPlaybackManager'), 'audio playback has a persistent document-level manager')
check(audioPlayback.includes("audio.preload = 'none'"), 'audio starts without metadata or payload preload')
check(audioPlayback.includes("if (!audio.getAttribute('src')) audio.src = track.src"), 'audio source assignment is deferred behind playback')
check(audioPlayback.includes('pauseOthers(track)'), 'starting a track pauses other project tracks')
check(audioPlayback.includes("document.addEventListener('visibilitychange'"), 'backgrounding pauses active audio')
check(audioPlayback.includes("audio.removeAttribute('src')"), 'audio source is released on real lifecycle teardown')
check(audioPlayback.includes("audio.addEventListener('error'"), 'audio observes media failures')
check(audioPlayback.includes('Document audio failed:'), 'audio failures are surfaced to diagnostics')
check(audioPlayback.includes('setDocument(item)'), 'document changes own audio teardown')
check(audioPlayback.includes('setPowered(powered)'), 'POWER state owns audio teardown')
check(!audioBlocks.includes('new Audio('), 'view-bound audio controls do not own playback objects')
check(audioBlocks.includes("button.setAttribute('aria-pressed'"), 'audio exposes pressed/playback state')
check(audioBlocks.includes("button.setAttribute('aria-label'"), 'audio exposes a dynamic accessible label')
check(audioBlocks.includes("button.setAttribute('aria-describedby'"), 'audio exposes progress text')
check(audioBlocks.includes("live.setAttribute('role', 'status')"), 'audio exposes a dedicated live status region')
check(audioBlocks.includes('previousState !== null && state !== previousState'), 'live status only changes on playback transitions')
check(audioBlocks.includes('installTouchScroll(host, context)'), 'audio cards preserve touch scrolling')
check(audioBlocks.includes("button.addEventListener('click', activate)"), 'native button activation handles mouse, touch and keyboard')

check(bridge.includes('new AudioPlaybackManager'), 'CRT runtime owns persistent audio playback')
check(bridge.includes('this.audioPlayback.setDocument(documentItem)'), 'CRT runtime syncs audio to the active document')
check(bridge.includes("this.audioPlayback.setPowered(!this.tube.classList.contains('is-powered-off'))"), 'CRT runtime syncs audio to POWER state')
check(bridge.includes('enhanceAudioBlocks'), 'CRT runtime installs the audio renderer')
check(bridge.includes('registerAudioIntegration'), 'CRT runtime installs the audio interaction adapter')
check(semantic.includes("block.type === 'audio'"), 'semantic mirror describes audio blocks')

check(mediaBlocks.includes("return String(fit || '').toLowerCase() === 'contain'"), 'media renderer supports contain without cropping')
check(mediaBlocks.includes("provider: 'media-single'"), 'single media exposes inspector integration')
check(integrations.includes("button.className = 'document-media-hotspot'"), 'media blocks receive a clickable inspection hotspot')
check(integrations.includes("viewer.open([{ src: block.src"), 'media click opens original image in inspector')

const astroMediaDirectives = astro.match(/^::media\{[^\n]+\}$/gm) || []
check(astroMediaDirectives.length >= 6, 'Astro keeps several editorial images in the story')
check(astroMediaDirectives.every(line => /\bfit=contain\b/.test(line)), 'every Astro editorial image opts out of cropping')

const editorialImages = new Set([
  'key-art.webp',
  ...astroMediaDirectives.map(line => parseAttributes(line).src).filter(Boolean),
])

const galleryBody = astro.match(/::gallery\{[^\n]*\}\n([\s\S]*?)\n::/)?.[1] || ''
for (const line of galleryBody.split('\n')) {
  const src = line.split('|')[0]?.trim()
  if (src) editorialImages.add(src)
}

for (const filename of editorialImages) {
  const filePath = path.join('content/projects/astro', filename)
  check(fs.existsSync(filePath), `${filename} exists`)
  if (!fs.existsSync(filePath)) continue

  const size = fs.statSync(filePath).size
  check(size > 1000 && size < 250_000, `${filename} is optimized for CRT presentation`)

  if (path.extname(filename).toLowerCase() !== '.webp') continue
  const dimensions = readWebpSize(filePath)
  check(Boolean(dimensions), `${filename} exposes valid WebP dimensions`)
  if (dimensions) {
    const longSide = Math.max(dimensions.width, dimensions.height)
    const shortSide = Math.min(dimensions.width, dimensions.height)
    check(longSide >= 700 && shortSide >= 500, `${filename} keeps inspector-ready resolution`)
  }
}

check(!astro.includes('::hero{'), 'Astro does not use a cropping hero block')
check(!astro.includes('::system{'), 'Astro avoids decorative system-card grids')
check(!astro.includes('::pipeline{'), 'Astro avoids decorative pipeline blocks')

const astroVideoDirectives = astro.match(/^::video\{[^\n]+\}$/gm) || []
check(astroVideoDirectives.length > 0, 'Astro exposes at least one gameplay video')
for (const directive of astroVideoDirectives) {
  const { src } = parseAttributes(directive)
  check(Boolean(src), 'Astro video directive has a source')
  if (!src?.startsWith('/media/')) continue
  const filePath = path.join('public', src)
  check(fs.existsSync(filePath), `${path.basename(src)} exists`)
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size
    check(size > 100_000 && size < 15_000_000, `${path.basename(src)} remains web-sized`)
  }
}

const astroAudioDirectives = astro.match(/^::audio\{[^\n]+\}$/gm) || []
check(astroAudioDirectives.length > 0, 'Astro exposes soundtrack tracks')

const audioSources = []
for (const directive of astroAudioDirectives) {
  const attrs = parseAttributes(directive)
  check(Boolean(attrs.src), 'Astro audio directive has a source')
  check(Boolean(attrs.label), 'Astro audio directive has a label')
  if (!attrs.src) continue

  audioSources.push(attrs.src)
  check(/^\/media\/Astro\/[^/]+\.(mp3|ogg|opus|wav|m4a)$/i.test(attrs.src), `${path.basename(attrs.src)} uses a supported local audio path`)

  const filePath = path.join('public', attrs.src)
  check(fs.existsSync(filePath), `${path.basename(attrs.src)} exists`)
  if (!fs.existsSync(filePath)) continue

  const size = fs.statSync(filePath).size
  check(size > 10_000 && size < 7_000_000, `${path.basename(attrs.src)} remains web-sized`)
}

check(new Set(audioSources).size === audioSources.length, 'Astro soundtrack sources are unique')
check(!astro.includes('-preview.mp3'), 'Astro page does not present truncated soundtrack previews')
check(astro.includes('link: https://awelyaa.itch.io/astro'), 'Astro primary project link is public itch.io')

check(astro.includes('CONFITURE DE JEUX × YNOV 2024'), 'Astro identifies the original game jam')
check(astro.includes('Pick up an egg. Bring it back to your chest.'), 'Astro explains the original egg/chest loop')
check(astro.includes('send somebody over the edge of the map'), 'Astro explains competitive pushing and falling')
check(!astro.toLowerCase().includes('cooperation phase'), 'Astro does not invent a cooperation phase')
check(astro.includes('4 PROJECTS SELECTED FROM 38'), 'Astro records Game Créalab selection accurately')
check(astro.includes('Pôle Pixel in Villeurbanne'), 'Astro names the Game Créalab location')
check(astro.includes('Focus Entertainment'), 'Astro records publisher contact context')
check(astro.includes('Game Designer and Programmer'), 'Astro states Jordan design/programming role')
check(astro.includes('Game design took most of my time'), 'Astro keeps the role emphasis concrete')
check(astro.includes('The volcano never became a finished mode'), 'Astro separates the production blockout from finished content')
check(astro.includes('PLAYERS | 2–4 COMPETITIVE CORE'), 'Astro records the competitive player count')
check(astro.includes('Pauline Mercat'), 'Astro credits Pauline Mercat')
check(astro.includes('Alexandre Gaulé'), 'Astro credits Alexandre Gaulé')
check(astro.includes('Eliott Guignabaudet'), 'Astro credits Eliott Guignabaudet')
check(astro.includes('Zoé Guignabaudet'), 'Astro credits Zoé Guignabaudet')
check(!astro.toLowerCase().includes('portfolio'), 'Astro copy stays focused on the project rather than the page itself')
check(!astro.includes('I like keeping it accessible'), 'Astro does not frame the public jam build as a deliberate curation choice')
check(!astro.includes('The project still has planned directions'), 'Astro current-status section stays concise')
check(!astro.includes('still lists ASTRO among the four selected projects'), 'Astro avoids source-verification prose')
check(!astro.includes("The CNC's 2024 FAJV results"), 'Astro avoids source-verification prose')
check(!astro.includes('Most players will never notice any of this'), 'Astro production section ends on the engineering point')
check(astro.includes('ASTRO is currently **paused**'), 'Astro reports the real project status')
check(astro.includes('professional schedules changed'), 'Astro explains why development paused')
check(astro.includes('## THE TEAM'), 'Astro includes the team and production context')
check(astro.includes('## SOUNDTRACK'), 'Astro includes the soundtrack section')

console.log(failed ? `\n  ${failed} audio/Astro check(s) FAILED` : '\n  all audio/Astro checks passed')
process.exit(failed ? 1 : 0)
