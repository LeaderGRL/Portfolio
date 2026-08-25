/**
 * Smoke test for the built page.
 *
 * There is no browser in CI and none in the environment this was written in,
 * so the class of bug that ships is the class a syntax check cannot see: a
 * module that boots twice, a sprite that never resolves, a custom property the
 * stylesheet needs and nobody sets. This loads dist/index.html into jsdom with
 * WebGL forced off, lets it run, and asserts on what the DOM actually contains.
 *
 * It caught exactly that: app.js kept the monolith's self-boot while main.js
 * also called start(), so every key was built twice and the nav column burst
 * its grid row.
 *
 *   npm run build && npm test
 */
import { JSDOM } from 'jsdom'
import fs from 'node:fs'

const html = fs.readFileSync('dist/index.html', 'utf8')
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' })
const w = dom.window
w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} })
w.devicePixelRatio = 1
Object.defineProperty(w, 'innerWidth',  { value: 1440, configurable: true })
Object.defineProperty(w, 'innerHeight', { value: 900,  configurable: true })
/**
 * WebGL2 stand-in. Enough of the API to let the CRT pipeline build its
 * programs and render targets, so `npm test -- --gl` proves the tube actually
 * initialises instead of silently falling back to the 2D path.
 *
 * This is the check that was missing: crt.js used SRC_H without importing it,
 * threw during target creation, and the app quietly took the fallback. From
 * the outside that looks exactly like "the CRT effect doesn't work".
 */
const WANT_GL = process.argv.includes('--gl')
function makeGL () {
  const obj = (tag) => ({ __tag: tag })
  const gl = new Proxy({
    FRAMEBUFFER_COMPLETE: 36053,
    createShader: () => obj('shader'),
    createProgram: () => obj('program'),
    createBuffer: () => obj('buffer'),
    createTexture: () => obj('texture'),
    createFramebuffer: () => obj('fbo'),
    createVertexArray: () => obj('vao'),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    checkFramebufferStatus: () => 36053,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getUniformLocation: (_, n) => ({ __uniform: n }),
    getAttribLocation: () => 0,
    getExtension: () => null,
    getParameter: () => 4096,
  }, {
    get: (target, key) => {
      if (key in target) return target[key]
      if (typeof key === 'string' && /^[A-Z0-9_]+$/.test(key)) return 1   // GL enums
      return () => {}
    },
  })
  return gl
}

w.HTMLCanvasElement.prototype.getContext = function (t) {
  if (t === 'webgl2') return WANT_GL ? makeGL() : null
  if (t === 'webgl') return null
  const noop = () => {}
  return new Proxy({}, { get: (_, k) => {
    if (k === 'measureText') return () => ({ width: 6 })
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: noop })
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
    if (k === 'canvas') return { width: 480, height: 360 }
    return noop
  }, set: () => true })
}
w.AudioContext = w.webkitAudioContext = undefined

// Every uncaught error matters: the failures that shipped were ReferenceErrors
// on code paths a syntax check never walks.
const errors = []
w.addEventListener('error', e => errors.push(e.message))
w.onerror = (m) => { errors.push(String(m)); return true }

const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
try { w.eval(code) } catch (e) { errors.push(e.message) }

setTimeout(() => {
  const d = w.document
  let failed = 0
  const n = d.querySelectorAll('#nav-keys .key').length
  const a = d.querySelectorAll('#action-keys .key').length
  const imgs = [...d.querySelectorAll('img[data-asset]')]
  const ok = (c) => { if (!c) failed++; return c ? 'OK' : 'WRONG' }
  console.log('  nav keys        :', n, ok(n === 6))
  console.log('  action keys     :', a, ok(a === 2))
  console.log('  --fit           :', d.documentElement.style.getPropertyValue('--fit') || 'NOT SET')
  console.log('  --ap-l / --cap-w:', d.documentElement.style.getPropertyValue('--ap-l') || '-',
              '/', d.documentElement.style.getPropertyValue('--cap-w') || '-')
  console.log('  --pad-h         :', d.documentElement.style.getPropertyValue('--pad-h') || 'NOT SET')
  console.log('  sprites resolved:', imgs.filter(i => i.src.startsWith('data:')).length, '/', imgs.length)
  const keyFaces = d.querySelectorAll('#nav-keys .key:first-child > .key__button > .key__face').length
  console.log('  cavity/edge/face:', keyFaces, ok(keyFaces === 1))
  const keyLeds = d.querySelectorAll('#nav-keys .key > .key__button > .key__led').length
  console.log('  integrated LEDs :', keyLeds, ok(keyLeds === 6))
  const powerMarks = d.querySelectorAll('.rocker__marks').length
  console.log('  power I/O marks :', powerMarks, ok(powerMarks === 0))
  const fellBack = d.getElementById('tube').classList.contains('is-fallback')
  console.log('  2D fallback on  :', fellBack)
  if (WANT_GL) ok(!fellBack)          // with a GL context available it must not fall back

  // Walk every route and open the first item of each collection. Rendering a
  // page is where module-boundary mistakes actually surface — projects and
  // articles both threw on a constant that was never imported, and nothing
  // before this step would have noticed.
  const keys = [...d.querySelectorAll('#nav-keys .key')]
  for (const k of keys) {
    const label = k.querySelector('.key__legend').textContent
    const before = errors.length
    k.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    const glyphs = d.getElementById('live').textContent.replace(/\s/g, '').length
    ok(errors.length === before && glyphs > 20)
    console.log(`  route ${label.padEnd(9)}:`, errors.length > before
      ? 'THREW ' + errors[before].slice(0, 90)
      : `${glyphs} glyphs OK`)
  }

  // and a detail page, which is the only path that renders media blocks
  const enter = d.querySelectorAll('#action-keys .key')[0]
  const before = errors.length
  keys.find(k => k.querySelector('.key__legend').textContent === 'PROJECTS')
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  enter.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  const detail = d.getElementById('live').textContent.replace(/\s/g, '').length
  ok(errors.length === before && detail > 20)
  console.log('  detail page   :', errors.length > before
    ? 'THREW ' + errors[before].slice(0, 90) : `${detail} glyphs OK`)

  ok(errors.length === 0)
  if (errors.length) console.log('\n  uncaught errors:\n   ' + [...new Set(errors)].join('\n   '))
  ok(imgs.length > 0 && imgs.every(i => i.src.startsWith('data:')))
  ok(d.documentElement.style.getPropertyValue('--fit') !== '')
  ok(d.documentElement.style.getPropertyValue('--ap-l') !== '')
  ok(d.documentElement.style.getPropertyValue('--pad-h') !== '')
  console.log(failed ? `\n  ${failed} check(s) FAILED` : '\n  all checks passed')
  process.exit(failed ? 1 : 0)
}, 500)
