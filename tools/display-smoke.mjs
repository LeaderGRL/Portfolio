import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const html = fs.readFileSync('dist/index.html', 'utf8')
const rasterSource = fs.readFileSync('src/article-rasteriser.js', 'utf8')
const readerSource = fs.readFileSync('src/article-reader.js', 'utf8')
const bridgeSource = fs.readFileSync('src/article-crt-bridge.js', 'utf8')
const integrationsSource = fs.readFileSync('src/document/default-integrations.js', 'utf8')
const mediaViewerSource = fs.readFileSync('src/document/media-viewer.js', 'utf8')
const mediaCss = fs.readFileSync('src/media-viewer.css', 'utf8')
const displayCss = fs.readFileSync('src/display.css', 'utf8')
const crtBypassCss = fs.readFileSync('src/crt-bypass.css', 'utf8')
const mainSource = fs.readFileSync('src/main.js', 'utf8')
const dom = new JSDOM(html)
const document = dom.window.document

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(54)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const tube = document.getElementById('tube')
const surface = document.getElementById('display-surface')
const article = document.getElementById('article-reader')
const terminalSource = document.getElementById('fallback2d')
const articleSource = document.getElementById('article-source')
const output = document.getElementById('gl')

check(Boolean(tube), 'tube exists')
check(Boolean(surface), 'semantic interaction surface exists')
check(Boolean(article), 'document semantic DOM exists')
check(Boolean(terminalSource), 'terminal pixel source exists')
check(Boolean(articleSource), 'document pixel source exists')
check(Boolean(output), 'single CRT WebGL output exists')
check(surface?.contains(article), 'semantic reader mounted inside screen')
check(articleSource?.tagName === 'CANVAS', 'document source is a canvas')
check(articleSource?.getAttribute('aria-hidden') === 'true', 'document source is accessibility inert')
check(tube?.dataset.displayMode === 'terminal', 'terminal is default display mode')
check(document.querySelectorAll('#gl').length === 1, 'single physical CRT output')
check(document.querySelectorAll('#article-source').length === 1, 'single document framebuffer')

check(!document.getElementById('article-interact-trigger'), 'legacy modal trigger removed')
check(!document.getElementById('article-interaction'), 'legacy modal surface removed')
check(!bridgeSource.includes('ArticleInteractionController'), 'bridge has no legacy modal controller')
check(!displayCss.includes('.article-interact-trigger'), 'legacy trigger CSS removed')
check(!displayCss.includes('.article-interaction{'), 'legacy modal CSS removed')

check(rasterSource.includes('getVisibleInteractiveEntry'), 'interactive block discovery exists')
check(integrationsSource.includes("registry.register('video'"), 'local video adapter exists')
check(integrationsSource.includes("iframe.loading = 'lazy'"), 'remote iframes request lazy loading')
check(readerSource.includes("video.preload = 'none'"), 'user-started video avoids eager preload')
check(readerSource.includes('pauseArticleMedia'), 'document media pause boundary exists')
check(readerSource.includes("document.addEventListener('visibilitychange'"), 'hidden browser tabs pause media')
check(readerSource.includes("is-powered-off"), 'power-off state pauses document media')

check(mediaViewerSource.includes('MediaViewer'), 'CRT media inspector exists')
check(mediaViewerSource.includes('media-inspect-hires'), 'CRT-off hires inspection source exists')
check(mediaCss.includes('.document-media-hotspot'), 'media inspection hotspots are styled')
check(mediaCss.includes('[data-display-mode="media"] .display-surface'), 'semantic DOM stays behind media inspection')
check(!mediaCss.includes('.document-media-viewer__stage'), 'old browser media modal CSS removed')

check(displayCss.includes('.tube.is-fallback[data-display-mode="article"] #article-source'), 'document WebGL fallback exists')
check(displayCss.includes('.document-inline-integrations'), 'inline integration layer is bundled')
check(displayCss.includes('#document-crt-native-optics'), 'cross-origin CRT optics are applied')
check(mainSource.includes("import './crt-bypass.css'"), 'CRT bypass styles are bundled')
check(crtBypassCss.includes('.tube.is-crt-off #gl'), 'CRT off hides WebGL composite')
check(crtBypassCss.includes('#article-source'), 'CRT off exposes document source directly')
check(crtBypassCss.includes('.tube.is-crt-off .tube__shade'), 'CRT off removes photographic shade')
check(crtBypassCss.includes('.tube.is-crt-off .tube__gloss'), 'CRT off removes photographic gloss')

// Exercise the actual layout and framebuffer code, not just a CSS declaration:
// a large source is useless if the persistence pass downsamples it to 480x360.
globalThis.matchMedia = () => ({ matches: false })
const { fullscreenLayout } = await import('../src/fullscreen-layout.js')
const { CRT } = await import('../src/crt.js')
for (const [width, height, dpr] of [[1920, 1080, 1], [393, 851, 3], [3840, 2160, 2], [7680, 4320, 2]]) {
  const layout = fullscreenLayout(width, height, dpr, 74)
  check(layout.pixelWidth * layout.pixelHeight <= 8388608, `${width}x${height}: framebuffer fits pixel budget`)
  check(Math.max(layout.pixelWidth, layout.pixelHeight) <= 4096, `${width}x${height}: texture dimension is bounded`)
  check(Math.abs(layout.terminal.width / layout.terminal.height - 4 / 3) < .00001, `${width}x${height}: terminal glyphs stay proportional`)
  check(layout.terminal.y + layout.terminal.height <= height - layout.bottom + .01, `${width}x${height}: terminal clears navigation`)
}
const hd = fullscreenLayout(1920, 1080, 1, 32)
check(hd.pixelWidth === 1920 && hd.pixelHeight === 1080, '1080p source is rendered at its actual resolution')
const allocations = []
const uniforms = {}
let disposed = 0
const gl = new Proxy({
  getShaderParameter: () => true,
  getProgramParameter: () => true,
  getUniformLocation: (_program, name) => name,
  texImage2D: (...args) => { if (args.length === 9) allocations.push([args[3], args[4]]) },
  uniform2f: (name, x, y) => { uniforms[name] = [x, y] },
  deleteFramebuffer: () => { disposed++ },
}, { get: (target, key) => key in target ? target[key] : /^[A-Z0-9_]+$/.test(key) ? key : () => ({}) })
const source = { width: 1920, height: 1080 }
const crt = new CRT({ getContext: () => gl, width: 1920, height: 1080 }, source)
const state = { fullscreen: true, crt: 1, power: 1, time: 0, warm: 1, static: 0, degauss: 0 }
crt.render(state, true)
check(allocations.slice(-2).every(([w, h]) => w === 1920 && h === 1080), 'both persistence textures retain full source resolution')
check(uniforms.uSrc?.join('x') === '1920x1080', 'shader source-pixel optics use the real resolution')
const count = allocations.length
crt.render(state, false)
check(allocations.length === count, 'stable frames do not reallocate persistence textures')
Object.assign(source, { width: 480, height: 360 })
crt.render({ ...state, fullscreen: false }, true)
check(allocations.slice(-2).every(([w, h]) => w === 480 && h === 360) && disposed === 4, 'return to desk releases high-resolution framebuffers')

console.log(failed ? `\n  ${failed} display check(s) FAILED` : '\n  all display checks passed')
process.exit(failed ? 1 : 0)
