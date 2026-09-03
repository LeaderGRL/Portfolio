import fs from 'node:fs'
import { DIRECTIVE_TYPES, getBlockDefinition, normalizeProvider } from '../src/document/schema.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(62)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const audioBlocks = fs.readFileSync('src/document/audio-blocks.js', 'utf8')
const bridge = fs.readFileSync('src/article-crt-bridge.js', 'utf8')
const semantic = fs.readFileSync('src/document/semantic-blocks.js', 'utf8')
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

for (const filename of ['menu-preview.mp3', 'in-game-preview.mp3', 'volcano-preview.mp3', 'victory-jingle.mp3']) {
  const path = `public/media/Astro/${filename}`
  check(fs.existsSync(path), `${filename} exists`)
  const size = fs.existsSync(path) ? fs.statSync(path).size : 0
  check(size > 1000 && size < 100_000, `${filename} stays lightweight`)
  check(astro.includes(`/media/Astro/${filename}`), `${filename} is referenced by Astro`)
}

for (const filename of ['gameplay.webp', 'design-board.webp', 'team.webp', 'volcano-blockout.webp']) {
  const path = `content/projects/astro/${filename}`
  check(fs.existsSync(path), `${filename} exists`)
  const size = fs.existsSync(path) ? fs.statSync(path).size : 0
  check(size > 1000 && size < 100_000, `${filename} is optimized for CRT presentation`)
}

check(astro.includes('JORDAN GRILLY | GAME DESIGNER'), 'Astro keeps Jordan role attribution explicit')
check(astro.includes('GAME FLOW AS STATES'), 'Astro documents game-flow engineering')
check(astro.includes('DATA-DRIVEN AUDIO'), 'Astro documents audio engineering')
check(astro.includes('## THE TEAM'), 'Astro documents the multidisciplinary team')
check(astro.includes('## FROM IDEAS TO RULES'), 'Astro documents the design reasoning process')

console.log(failed ? `\n  ${failed} audio/Astro check(s) FAILED` : '\n  all audio/Astro checks passed')
process.exit(failed ? 1 : 0)
