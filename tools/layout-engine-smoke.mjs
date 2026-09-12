import {
  aspectDistance,
  aspectRatio,
  displayLayout,
  fittedRect,
  framebufferSize,
  fitScale,
} from '../src/layout-engine.js'

globalThis.matchMedia = () => ({ matches: false })
const { fullscreenLayout } = await import('../src/fullscreen-layout.js')

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(68)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const close = (actual, expected, epsilon = 1e-9) => Math.abs(actual - expected) <= epsilon

const desktop = fittedRect(1440, 900, 1920, 1080, 'cover')
check(close(desktop.scale, 900 / 1080), 'desktop cover scale keeps the authored 16:9 composition')
check(close(desktop.width, 1600) && close(desktop.x, -80), 'desktop cover remains horizontally centred')

const portrait = fittedRect(412, 915, 941, 1672, 'contain')
check(close(portrait.scale, Math.min(412 / 941, 915 / 1672)), 'portrait contain scale remains deterministic')
check(close(portrait.gapX, 0) && portrait.gapY > 0, 'portrait continuation gap stays on the unused axis')

check(close(fitScale(915, 412, 1920, 1080, 'contain'), 412 / 1080), 'contain fitting uses the limiting viewport axis')
check(close(fitScale(915, 412, 1920, 1080, 'cover'), 915 / 1920), 'cover fitting uses the filling viewport axis')
check(close(aspectRatio(915, 412), 915 / 412), 'aspect ratio is independent from DOM state')
check(aspectDistance(16 / 9, 20 / 9) < aspectDistance(16 / 9, 3), 'aspect distance ranks nearby authored ratios first')

const framebuffer = framebufferSize(7680, 4320, 2, 4096)
check(Math.max(framebuffer.pixelWidth, framebuffer.pixelHeight) <= 4096, 'framebuffer respects the texture dimension limit')
check(framebuffer.pixelWidth * framebuffer.pixelHeight <= 8_388_608, 'framebuffer respects the total pixel budget')

const sharedDisplay = displayLayout({
  width: 568,
  height: 280,
  sourceWidth: 480,
  sourceHeight: 360,
  bottom: 132,
  textScale: 1.5,
  dpr: 2,
})
check(close(sharedDisplay.terminal.height, 148), 'reserved controls reduce terminal fitting height before centring')
check(close(sharedDisplay.terminal.y, 0), 'short landscape terminal remains above reserved controls')
check(close(sharedDisplay.documentBottom, 88), 'document reserve uses the same logical text scale')

const fullscreen = fullscreenLayout(568, 280, 2, 120)
check(close(fullscreen.bottom, 132), 'fullscreen adapter preserves its authored control reserve')
check(close(fullscreen.terminal.height, 148), 'fullscreen adapter uses the shared terminal geometry')
check(fullscreen.pixelWidth * fullscreen.pixelHeight <= 8_388_608, 'fullscreen adapter uses the shared framebuffer budget')

console.log(failed ? `\n  ${failed} layout-engine check(s) FAILED` : '\n  all layout-engine checks passed')
process.exit(failed ? 1 : 0)
