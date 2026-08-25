import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const html = fs.readFileSync('dist/index.html', 'utf8')
const dom = new JSDOM(html)
const document = dom.window.document

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(28)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const tube = document.getElementById('tube')
const surface = document.getElementById('display-surface')
const overlay = document.getElementById('crt-overlay')
const article = document.getElementById('article-reader')

check(Boolean(tube), 'tube exists')
check(Boolean(surface), 'surface root exists')
check(Boolean(overlay), 'CRT overlay exists')
check(Boolean(article), 'article reader exists')
check(surface?.contains(article), 'article mounted in surface')
check(overlay?.tagName === 'CANVAS', 'overlay is a canvas')
check(overlay?.getAttribute('aria-hidden') === 'true', 'overlay is accessibility inert')
check(tube?.dataset.displayMode === 'terminal', 'terminal is default mode')
check(document.querySelectorAll('#crt-overlay').length === 1, 'single shared overlay')

const source = html
check(source.includes('.crt-overlay'), 'overlay styles bundled')
check(source.includes('.display-surface'), 'surface styles bundled')
check(source.includes('pointer-events:none'), 'overlay cannot trap input')

console.log(failed ? `\n  ${failed} display check(s) FAILED` : '\n  all display checks passed')
process.exit(failed ? 1 : 0)
