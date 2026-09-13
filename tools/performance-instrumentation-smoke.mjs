import {
  resourceCategory,
  summarizeFrameSamplesByMode,
  summarizeFrameTimes,
  summarizeResources,
} from '../src/performance-instrumentation.js'

const check = (condition, message) => {
  if (!condition) throw new Error(message)
  console.log(`ok - ${message}`)
}

const frames = summarizeFrameTimes([16, 17, 18, 60])
check(frames.samples === 4, 'frame summary keeps the measured sample count')
check(frames.p50Ms === 17 && frames.p95Ms === 60, 'frame summary exposes stable percentiles')
check(frames.over50Ms === 1, 'frame summary counts long frames without enforcing a runner-speed budget')

const entries = [
  { name: 'https://local.test/assets/app.js', initiatorType: 'script', duration: 12, transferSize: 100 },
  { name: 'https://local.test/assets/app.css', initiatorType: 'link', duration: 5, transferSize: 50 },
  { name: 'https://local.test/assets/font.woff2', initiatorType: 'css', duration: 3, transferSize: 25 },
  { name: 'https://local.test/assets/chassis.webp', initiatorType: 'img', duration: 20, transferSize: 200 },
  { name: 'https://local.test/assets/edge-fill.webp', initiatorType: 'css', duration: 6, transferSize: 75 },
  { name: 'https://local.test/assets/performance-instrumentation.js', initiatorType: 'script', duration: 2, transferSize: 10 },
]
const resources = summarizeResources(entries)
check(resourceCategory(entries[0]) === 'script', 'scripts are categorized as script resources')
check(resourceCategory(entries[2]) === 'font', 'font extensions take precedence over CSS initiators')
check(resourceCategory(entries[4]) === 'image', 'image extensions take precedence over CSS initiators')
check(resources.categories.image.transferBytes === 275, 'resource summaries aggregate transfer bytes by category')
check(resources.categories.instrumentation.count === 1, 'measurement overhead is reported separately')
check(resources.entries.every(entry => entry.name.startsWith('/assets/')), 'resource entries expose local paths instead of origins')

const frameModes = summarizeFrameSamplesByMode([
  { deltaMs: 16, mode: { crtEnabled: true, fullscreen: false, displayMode: 'terminal', mediaOpen: false, powerEnabled: true } },
  { deltaMs: 17, mode: { crtEnabled: true, fullscreen: false, displayMode: 'terminal', mediaOpen: false, powerEnabled: true } },
  { deltaMs: 18, mode: { crtEnabled: false, fullscreen: false, displayMode: 'terminal', mediaOpen: false, powerEnabled: true } },
])
check(frameModes.length === 2, 'frame samples are partitioned by active runtime mode')
check(frameModes.some(bucket => bucket.mode.crtEnabled === false && bucket.timing.samples === 1), 'CRT-off timing is measurable independently')
