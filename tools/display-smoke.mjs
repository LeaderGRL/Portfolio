import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const html = fs.readFileSync('dist/index.html', 'utf8')
const dom = new JSDOM(html)
const document = dom.window.document

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(34)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const tube = document.getElementById('tube')
const surface = document.getElementById('display-surface')
const article = document.getElementById('article-reader')
const terminalSource = document.getElementById('fallback2d')
const articleSource = document.getElementById('article-source')
const output = document.getElementById('gl')

check(Boolean(tube), 'tube exists')
check(Boolean(surface), 'interaction surface exists')
check(Boolean(article), 'article interaction DOM exists')
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

const source = html
check(source.includes('display-pixel-source'), 'pixel-source styles bundled')
check(source.includes('data-display-mode') && source.includes('article'), 'article display mode bundled')
check(source.includes('opacity:0'), 'DOM becomes visual-inert')
check(source.includes('pointer-events:auto'), 'DOM keeps interaction')

console.log(failed ? `\n  ${failed} display check(s) FAILED` : '\n  all display checks passed')
process.exit(failed ? 1 : 0)
