import fs from 'node:fs'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(62)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const site = JSON.parse(fs.readFileSync('content/site.json', 'utf8'))
const pages = fs.readFileSync('src/pages.js', 'utf8')
const rasteriser = fs.readFileSync('src/article-rasteriser.js', 'utf8')
const integrations = fs.readFileSync('src/document/default-integrations.js', 'utf8')
const frogbyte = fs.readFileSync('content/projects/frogbyte.md', 'utf8')

check(site.identity.base === 'LYON / PARIS', 'HOME base is Lyon / Paris')
check(site.identity.stack === 'RUST · C#', 'HOME stack does not claim TypeScript')
check(!/game/i.test(site.identity.tagline), 'HOME tagline has no game-specific framing')
check(/performance/i.test(site.identity.tagline), 'HOME tagline communicates performance')
check(pages.includes('t.opAt(2, (g, py) =>'), 'HOME bitmap headline is separated from chrome rows')
check(!pages.includes('BASE    PARIS / FR'), 'HOME no longer hardcodes the former base')
check(!pages.includes('STACK   RUST·C#·TS'), 'HOME no longer hardcodes TypeScript')

check(rasteriser.includes("if (entry.type === 'image')"), 'plain image blocks expose an interaction')
check(rasteriser.includes("provider: 'media-single'"), 'plain images reuse the generic CRT inspector')
check(rasteriser.includes("entry.type === 'image' || entry.type === 'video'"), 'plain images count as interactive document entries')
check(integrations.includes('Open document image'), 'media inspector copy is project/article neutral')

check(frogbyte.includes('https://github.com/FrogbyteEngine/Frogbyte'), 'Frogbyte points to the current organization repository')
check(frogbyte.includes('MIRI'), 'Frogbyte documents memory-model validation')
check(frogbyte.includes('DEPENDABOT'), 'Frogbyte documents dependency automation')
check(/generational/i.test(frogbyte), 'Frogbyte documents generational entity identity')
check(!/Benchmarked against Bevy/i.test(frogbyte), 'stale Bevy benchmark claim has been removed')
check(!/frogbyte-bench\.png/i.test(frogbyte), 'missing benchmark image is no longer referenced')

console.log(failed ? `\n  ${failed} home/article regression check(s) FAILED` : '\n  all home/article regression checks passed')
process.exit(failed ? 1 : 0)
