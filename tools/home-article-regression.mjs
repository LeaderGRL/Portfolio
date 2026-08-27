import fs from 'node:fs'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(62)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const site = JSON.parse(fs.readFileSync('content/site.json', 'utf8'))
const pages = fs.readFileSync('src/pages.js', 'utf8')
const about = fs.readFileSync('content/pages/about.md', 'utf8')
const resume = fs.readFileSync('content/pages/resume.md', 'utf8')
const rasteriser = fs.readFileSync('src/article-rasteriser.js', 'utf8')
const integrations = fs.readFileSync('src/document/default-integrations.js', 'utf8')
const frogbyte = fs.readFileSync('content/projects/frogbyte.md', 'utf8')
const articleFiles = fs.readdirSync('content/articles').filter(name => name.endsWith('.md')).sort()
const graphArticle = fs.readFileSync('content/articles/04-graph-algorithms-rust.md', 'utf8')

check(site.identity.base === 'LYON / PARIS', 'HOME base is Lyon / Paris')
check(site.identity.stack === 'RUST · C#', 'HOME stack does not claim TypeScript')
check(!/game/i.test(site.identity.tagline), 'HOME tagline has no game-specific framing')
check(/performance/i.test(site.identity.tagline), 'HOME tagline communicates performance')
check(pages.includes('t.opAt(2, (g, py) =>'), 'HOME bitmap headline is separated from chrome rows')
check(!pages.includes('BASE    PARIS / FR'), 'HOME no longer hardcodes the former base')
check(!pages.includes('STACK   RUST·C#·TS'), 'HOME no longer hardcodes TypeScript')

check(/software and systems engineer/i.test(about), 'ABOUT opens with an engineering profile')
check(!/\bgameplay\b/i.test(about), 'ABOUT no longer positions around gameplay')
check(!/\bSvelte\b/i.test(about), 'ABOUT does not list Svelte')
check(!/\bTypeScript\b/i.test(about), 'ABOUT does not list TypeScript')
check(!/\bSvelte\b/i.test(resume), 'RESUME does not list Svelte')
check(!/\bTypeScript\b/i.test(resume), 'RESUME does not list TypeScript')
check(/systems engineer/i.test(resume), 'RESUME profile is engineering-oriented')

check(rasteriser.includes("if (entry.type === 'image')"), 'plain image blocks expose an interaction')
check(rasteriser.includes("provider: 'media-single'"), 'plain images reuse the generic CRT inspector')
check(rasteriser.includes("entry.type === 'image' || entry.type === 'video'"), 'plain images count as interactive document entries')
check(integrations.includes('Open document image'), 'media inspector copy is project/article neutral')
check(integrations.includes("registry.register('gist'"), 'Gist embeds use the generic integration registry')

check(articleFiles.length === 5, 'portfolio exposes exactly five imported articles')
check(!articleFiles.some(name => /fr/i.test(name)), 'French graph article is excluded from portfolio')
check(articleFiles.includes('06-parallax-cards-rive.md'), 'Parallax article is included')
check(/provider=gist/.test(graphArticle), 'graph article preserves interactive GitHub Gists')

check(frogbyte.includes('https://github.com/FrogbyteEngine/Frogbyte'), 'Frogbyte points to the current organization repository')
check(/\bMiri\b/i.test(frogbyte), 'Frogbyte documents memory-model validation')
check(/\bDependabot\b/i.test(frogbyte), 'Frogbyte documents dependency automation')
check(/generational/i.test(frogbyte), 'Frogbyte documents generational entity identity')
check(!/Benchmarked against Bevy/i.test(frogbyte), 'stale Bevy benchmark claim has been removed')
check(!/frogbyte-bench\.png/i.test(frogbyte), 'missing benchmark image is no longer referenced')

console.log(failed ? `\n  ${failed} home/article regression check(s) FAILED` : '\n  all home/article regression checks passed')
process.exit(failed ? 1 : 0)
