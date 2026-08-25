import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const html = fs.readFileSync('dist/index.html', 'utf8')
const rasterSource = fs.readFileSync('src/article-rasteriser.js', 'utf8')
const displayCss = fs.readFileSync('src/display.css', 'utf8')
const crtBypassCss = fs.readFileSync('src/crt-bypass.css', 'utf8')
const mainSource = fs.readFileSync('src/main.js', 'utf8')
const interactionSource = fs.readFileSync('src/article-interaction.js', 'utf8')
const contentPlugin = fs.readFileSync('plugins/content.js', 'utf8')
const ecsArticle = fs.readFileSync('content/articles/02-ecs-rust-data-oriented-design.md', 'utf8')
const dom = new JSDOM(html)
const document = dom.window.document

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(42)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const tube = document.getElementById('tube')
const surface = document.getElementById('display-surface')
const article = document.getElementById('article-reader')
const terminalSource = document.getElementById('fallback2d')
const articleSource = document.getElementById('article-source')
const output = document.getElementById('gl')
const interactTrigger = document.getElementById('article-interact-trigger')
const interaction = document.getElementById('article-interaction')
const interactionContent = document.getElementById('article-interaction-content')
const interactionClose = document.getElementById('article-interaction-close')

check(Boolean(tube), 'tube exists')
check(Boolean(surface), 'interaction surface exists')
check(Boolean(article), 'article semantic DOM exists')
check(Boolean(terminalSource), 'terminal pixel source exists')
check(Boolean(articleSource), 'article pixel source exists')
check(Boolean(output), 'single CRT output exists')
check(surface?.contains(article), 'article DOM mounted in surface')
check(articleSource?.tagName === 'CANVAS', 'article source is canvas')
check(articleSource?.getAttribute('aria-hidden') === 'true', 'article source is accessibility inert')
check(tube?.dataset.displayMode === 'terminal', 'terminal is default mode')
check(document.querySelectorAll('#gl').length === 1, 'single physical CRT output')
check(document.querySelectorAll('#article-source').length === 1, 'single article pixel source')
check(document.querySelectorAll('#crt-overlay').length === 0, 'legacy overlay removed')
check(document.querySelectorAll('#display-crt-optics').length === 0, 'legacy DOM optics removed')

check(Boolean(interactTrigger), 'visible interaction trigger exists')
check(Boolean(interaction), 'native interaction surface exists')
check(Boolean(interactionContent), 'interaction content mount exists')
check(Boolean(interactionClose), 'interaction close control exists')
check(interactTrigger?.hidden === true, 'interaction trigger starts hidden')
check(interaction?.hidden === true, 'interaction surface starts hidden')

check(!rasterSource.includes('slice(0, 18)'), 'code renderer is not truncated')
check(!rasterSource.includes('Math.min(lines.length, 18)'), 'code layout uses all lines')
check(rasterSource.includes('getVisibleInteractiveEntry'), 'interactive block discovery exists')
check(interactionSource.includes("descriptor.provider === 'video'"), 'native video interaction exists')
check(interactionSource.includes("entry.type === 'embed'"), 'inline embeds excluded from modal')

check(displayCss.includes('.tube.is-fallback[data-display-mode="article"] #article-source'), 'article WebGL fallback exists')
check(displayCss.includes('display:block !important'), 'fallback source becomes visible')
check(displayCss.includes('.article-interact-trigger'), 'interaction trigger styles bundled')
check(displayCss.includes('.article-interaction'), 'interaction surface styles bundled')

check(mainSource.includes("import './crt-bypass.css'"), 'CRT bypass styles are bundled')
check(crtBypassCss.includes('.tube.is-crt-off #gl'), 'CRT off hides WebGL composite')
check(crtBypassCss.includes('#article-source'), 'CRT off exposes article source directly')
check(crtBypassCss.includes('#fallback2d'), 'CRT off exposes terminal source directly')
check(crtBypassCss.includes('.tube.is-crt-off .tube__shade'), 'CRT off removes photographic shade')
check(crtBypassCss.includes('.tube.is-crt-off .tube__gloss'), 'CRT off removes photographic gloss')
check(crtBypassCss.includes('filter:none !important'), 'CRT off removes native embed optics')
check(crtBypassCss.includes('document-inline-integration--youtube::before'), 'CRT off removes inline scanline overlays')
check(crtBypassCss.includes('bottom:22px'), 'inline YouTube reserves media breathing room')

check(ecsArticle.includes('<iframe'), 'legacy Godbolt iframe still authored')
check(contentPlugin.includes('function parseRawIframe'), 'raw iframe parser exists')
check(contentPlugin.includes("type: 'embed'"), 'raw iframe normalizes to embed')
check(contentPlugin.includes('attrs.src'), 'raw iframe preserves source URL')
check(interactionSource.includes('isPoweredOn'), 'interaction observes CRT power state')
check(interactionSource.includes('this.close(false)'), 'power-off closes native interaction')
check(displayCss.includes('.tube.is-powered-off .article-interaction'), 'power-off interaction CSS exists')
check(displayCss.includes('display:none !important'), 'power-off surface is visually hidden')

console.log(failed ? `\n  ${failed} display check(s) FAILED` : '\n  all display checks passed')
process.exit(failed ? 1 : 0)
