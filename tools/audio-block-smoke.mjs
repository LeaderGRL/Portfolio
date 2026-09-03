import fs from 'node:fs'
import { DIRECTIVE_TYPES, getBlockDefinition, normalizeProvider } from '../src/document/schema.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(66)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const audioBlocks = fs.readFileSync('src/document/audio-blocks.js', 'utf8')
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

check(audioBlocks.includes("registry.register('audio'"), 'audio renderer and provider are registered')
check(audioBlocks.includes("audio.preload = 'metadata'"), 'audio avoids eager full-track loading')
check(audioBlocks.includes('stopOtherAudio(audio)'), 'starting a track pauses other project tracks')
check(audioBlocks.includes("document.addEventListener('visibilitychange'"), 'backgrounding pauses active audio')
check(audioBlocks.includes("audio.removeAttribute('src')"), 'audio source is released during teardown')
check(audioBlocks.includes("button.setAttribute('aria-label'"), 'audio playback surface has an accessible label')
check(audioBlocks.includes("event.key !== 'Enter' && event.key !== ' '"), 'audio supports keyboard playback')
check(audioBlocks.includes('MutationObserver(syncVolume)'), 'physical volume changes update audio')

check(bridge.includes('enhanceAudioBlocks'), 'CRT runtime installs the audio renderer')
check(bridge.includes('registerAudioIntegration'), 'CRT runtime installs the audio interaction adapter')
check(semantic.includes("block.type === 'audio'"), 'semantic mirror describes audio blocks')

check(mediaBlocks.includes("return String(fit || '').toLowerCase() === 'contain'"), 'media renderer supports contain without cropping')
check(mediaBlocks.includes("provider: 'media-single'"), 'single media exposes inspector integration')
check(integrations.includes("button.className = 'document-media-hotspot'"), 'media blocks receive a clickable inspection hotspot')
check(integrations.includes("viewer.open([{ src: block.src"), 'media click opens original image in inspector')

check(!astro.includes('-preview.mp3'), 'Astro page does not present truncated soundtrack previews')
const victoryPath = 'public/media/Astro/victory-jingle.mp3'
check(fs.existsSync(victoryPath), 'complete victory jingle remains available')
if (fs.existsSync(victoryPath)) {
  const size = fs.statSync(victoryPath).size
  check(size > 1000 && size < 250_000, 'victory jingle remains web-sized')
}

for (const filename of [
  'gameplay.webp',
  'design-board.webp',
  'game-crealab.webp',
  'characters.webp',
  'team.webp',
  'team-01.webp',
  'team-03.webp',
  'team-trip.webp',
]) {
  const path = `content/projects/astro/${filename}`
  check(fs.existsSync(path), `${filename} exists`)
  const size = fs.existsSync(path) ? fs.statSync(path).size : 0
  check(size > 1000 && size < 250_000, `${filename} is optimized for CRT presentation`)
}

const astroMediaDirectives = astro.match(/^::media\{[^\n]+\}$/gm) || []
check(astroMediaDirectives.length >= 4, 'Astro keeps several editorial images in the story')
check(astroMediaDirectives.every(line => /\bfit=contain\b/.test(line)), 'every Astro editorial image opts out of cropping')
check(!astro.includes('::hero{'), 'Astro does not use a cropping hero block')
check(!astro.includes('::system{'), 'Astro avoids decorative system-card grids')
check(!astro.includes('::pipeline{'), 'Astro avoids decorative pipeline blocks')

check(astro.includes('CONFITURE DE JEUX × YNOV 2024'), 'Astro identifies the original game jam')
check(astro.includes('Pick up an egg. Bring it back to your chest.'), 'Astro explains the original egg/chest loop')
check(astro.includes('send somebody over the edge of the map'), 'Astro explains competitive pushing and falling')
check(!astro.toLowerCase().includes('cooperation phase'), 'Astro does not invent a cooperation phase')
check(astro.includes('4 PROJECTS SELECTED FROM 38'), 'Astro records Game Créalab selection accurately')
check(astro.includes('Pôle Pixel in Villeurbanne'), 'Astro names the Game Créalab location')
check(astro.includes('Focus Entertainment'), 'Astro records publisher contact context')
check(astro.includes('Game Designer and Programmer'), 'Astro states Jordan design/programming role')
check(astro.includes('I would rather keep this section precise'), 'Astro avoids invented personal ownership')
check(astro.includes('ASTRO is currently **paused**'), 'Astro reports the real project status')
check(astro.includes('professional schedules changed'), 'Astro explains why development paused')
check(astro.includes('## THE TEAM'), 'Astro includes the team and production context')

console.log(failed ? `\n  ${failed} audio/Astro check(s) FAILED` : '\n  all audio/Astro checks passed')
process.exit(failed ? 1 : 0)
