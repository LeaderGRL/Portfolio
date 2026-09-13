const FRAME_SAMPLE_LIMIT = 3600
const TRANSITION_LIMIT = 256

const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null

const boundedPush = (items, value, limit) => {
  items.push(value)
  if (items.length > limit) items.shift()
}

const percentile = (sorted, ratio) => {
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

export function summarizeFrameTimes(samples) {
  const values = samples.filter(value => Number.isFinite(value) && value >= 0)
  if (!values.length) {
    return { samples: 0, averageMs: null, p50Ms: null, p95Ms: null, maxMs: null, over50Ms: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const total = values.reduce((sum, value) => sum + value, 0)
  return {
    samples: values.length,
    averageMs: round(total / values.length),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted[sorted.length - 1]),
    over50Ms: values.filter(value => value > 50).length,
  }
}

export function resourceCategory(entry) {
  const initiator = String(entry?.initiatorType || '').toLowerCase()
  const name = String(entry?.name || '').split(/[?#]/, 1)[0].toLowerCase()

  if (name.includes('performance-instrumentation')) return 'instrumentation'
  if (initiator === 'script' || name.endsWith('.js') || name.endsWith('.mjs')) return 'script'
  if (/\.(?:woff2?|ttf|otf)$/.test(name)) return 'font'
  if (initiator === 'css' || initiator === 'link' && name.endsWith('.css') || name.endsWith('.css')) return 'style'
  if (initiator === 'img' || /\.(?:avif|gif|jpe?g|png|svg|webp)$/.test(name)) return 'image'
  if (initiator === 'video' || initiator === 'audio' || /\.(?:mp3|mp4|ogg|wav|webm)$/.test(name)) return 'media'
  if (/\.(?:glb|gltf|bin)$/.test(name)) return 'model'
  if (initiator === 'fetch' || initiator === 'xmlhttprequest' || /\.json$/.test(name)) return 'data'
  return 'other'
}

const blankResourceSummary = () => ({
  count: 0,
  transferBytes: 0,
  encodedBytes: 0,
  decodedBytes: 0,
  durationMs: 0,
})

export function summarizeResources(entries) {
  const categories = Object.fromEntries(
    ['script', 'style', 'font', 'image', 'media', 'model', 'data', 'instrumentation', 'other']
      .map(category => [category, blankResourceSummary()]),
  )
  const resources = []

  for (const entry of entries || []) {
    const category = resourceCategory(entry)
    const summary = categories[category]
    const transferSize = Number(entry.transferSize) || 0
    const encodedBodySize = Number(entry.encodedBodySize) || 0
    const decodedBodySize = Number(entry.decodedBodySize) || 0
    const duration = Number(entry.duration) || 0
    summary.count++
    summary.transferBytes += transferSize
    summary.encodedBytes += encodedBodySize
    summary.decodedBytes += decodedBodySize
    summary.durationMs += duration

    let name = String(entry.name || '')
    try { name = new URL(name, globalThis.location?.href || 'https://local.invalid/').pathname }
    catch {}
    resources.push({
      name,
      category,
      initiatorType: String(entry.initiatorType || ''),
      startTimeMs: round(Number(entry.startTime) || 0),
      durationMs: round(duration),
      transferBytes: transferSize,
      encodedBytes: encodedBodySize,
      decodedBytes: decodedBodySize,
    })
  }

  for (const summary of Object.values(categories)) summary.durationMs = round(summary.durationMs)
  return { categories, entries: resources }
}

const navigationMetrics = () => {
  const navigation = performance.getEntriesByType?.('navigation')?.[0]
  if (!navigation) return null
  return {
    type: navigation.type || 'navigate',
    responseStartMs: round(navigation.responseStart),
    domInteractiveMs: round(navigation.domInteractive),
    domContentLoadedMs: round(navigation.domContentLoadedEventEnd),
    loadEventEndMs: round(navigation.loadEventEnd),
    transferBytes: Number(navigation.transferSize) || 0,
    encodedBytes: Number(navigation.encodedBodySize) || 0,
    decodedBytes: Number(navigation.decodedBodySize) || 0,
  }
}

const canvasSize = canvas => canvas
  ? { width: Number(canvas.width) || 0, height: Number(canvas.height) || 0 }
  : null

class RuntimePerformanceInstrumentation {
  constructor(app, { entryAt = 0, appReadyAt = 0 } = {}) {
    this.app = app
    this.startedAt = performance.now()
    this.entryAt = Number(entryAt) || 0
    this.appReadyAt = Number(appReadyAt) || this.startedAt
    this.firstFrameAt = null
    this.lastFrameAt = null
    this.frameTimes = { visible: [], hidden: [] }
    this.stateTransitions = []
    this.framebufferTransitions = []
    this.visibilityTransitions = []
    this.hiddenDurationMs = 0
    this.hiddenSince = document.visibilityState === 'hidden' ? this.startedAt : null
    this.pendingResumeAt = null
    this.resumeLatencies = []
    this.lastStateSignature = ''
    this.lastFramebufferSignature = ''
    this.stopped = false

    performance.setResourceTimingBufferSize?.(1000)

    this.onVisibilityChange = () => this.recordVisibility('visibilitychange')
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.recordVisibility('install')
    this.sampleRuntime('install')
    this.raf = requestAnimationFrame(time => this.frame(time))
  }

  recordVisibility(trigger) {
    const at = performance.now()
    const state = document.visibilityState || (document.hidden ? 'hidden' : 'visible')
    const previous = this.visibilityTransitions.at(-1)?.state || null

    if (state !== previous || trigger === 'install') {
      boundedPush(this.visibilityTransitions, { atMs: round(at), state, trigger }, TRANSITION_LIMIT)
    }

    if (state === 'hidden' && this.hiddenSince === null) this.hiddenSince = at
    if (state === 'visible' && this.hiddenSince !== null) {
      this.hiddenDurationMs += Math.max(0, at - this.hiddenSince)
      this.hiddenSince = null
      this.pendingResumeAt = at
    }

    // Do not fold time spent in a background tab into foreground frame time.
    this.lastFrameAt = null
  }

  stateSnapshot(trigger) {
    const { state = {} } = this.app
    const tube = document.getElementById('tube')
    return {
      atMs: round(performance.now()),
      trigger,
      route: state.route || null,
      item: state.item?.slug || state.item?.id || state.item?.label || null,
      fullscreen: Boolean(state.fullscreen),
      crtEnabled: Number(state.crtTarget ?? state.crt ?? 1) > 0.5,
      powerEnabled: Number(state.powerTarget ?? state.power ?? 1) > 0.5,
      displayMode: tube?.dataset?.displayMode || 'terminal',
      rasterLayout: tube?.dataset?.rasterLayout || null,
      mediaOpen: Boolean(tube?.classList.contains('is-media-inspecting')),
      compact: Boolean(document.body.classList.contains('is-compact-stage')),
      landscapeMobile: Boolean(document.body.classList.contains('is-landscape-mobile-stage')),
      viewport: {
        width: Number(globalThis.innerWidth) || 0,
        height: Number(globalThis.innerHeight) || 0,
        dpr: round(Number(globalThis.devicePixelRatio) || 1),
      },
    }
  }

  framebufferSnapshot(trigger) {
    const pipeline = this.app.displayPipeline
    const activeSource = pipeline?.getSource?.() || this.app.crt?.source || this.app.raster?.canvas || null
    const crt = this.app.crt
    const terminal = document.getElementById('fallback2d')
    const documentCanvas = document.getElementById('article-source')
    const hires = document.getElementById('media-inspect-hires')
    return {
      atMs: round(performance.now()),
      trigger,
      activeSource: pipeline?.activeId || activeSource?.id || null,
      source: canvasSize(activeSource),
      terminal: canvasSize(terminal),
      document: canvasSize(documentCanvas),
      mediaHires: canvasSize(hires),
      crtPersistence: crt ? { width: Number(crt.sourceWidth) || 0, height: Number(crt.sourceHeight) || 0 } : null,
      output: canvasSize(crt?.canvas),
      crtAvailable: Boolean(crt?.ok),
    }
  }

  sampleRuntime(trigger) {
    const state = this.stateSnapshot(trigger)
    const stateSignature = JSON.stringify({
      route: state.route,
      item: state.item,
      fullscreen: state.fullscreen,
      crtEnabled: state.crtEnabled,
      powerEnabled: state.powerEnabled,
      displayMode: state.displayMode,
      rasterLayout: state.rasterLayout,
      mediaOpen: state.mediaOpen,
      compact: state.compact,
      landscapeMobile: state.landscapeMobile,
      viewport: state.viewport,
    })
    if (stateSignature !== this.lastStateSignature) {
      this.lastStateSignature = stateSignature
      boundedPush(this.stateTransitions, state, TRANSITION_LIMIT)
    }

    const framebuffer = this.framebufferSnapshot(trigger)
    const framebufferSignature = JSON.stringify({
      activeSource: framebuffer.activeSource,
      source: framebuffer.source,
      terminal: framebuffer.terminal,
      document: framebuffer.document,
      mediaHires: framebuffer.mediaHires,
      crtPersistence: framebuffer.crtPersistence,
      output: framebuffer.output,
      crtAvailable: framebuffer.crtAvailable,
    })
    if (framebufferSignature !== this.lastFramebufferSignature) {
      this.lastFramebufferSignature = framebufferSignature
      boundedPush(this.framebufferTransitions, framebuffer, TRANSITION_LIMIT)
    }
  }

  frame(time) {
    if (this.stopped) return
    if (this.firstFrameAt === null) this.firstFrameAt = time

    if (this.pendingResumeAt !== null && document.visibilityState !== 'hidden') {
      boundedPush(this.resumeLatencies, Math.max(0, time - this.pendingResumeAt), TRANSITION_LIMIT)
      this.pendingResumeAt = null
    }

    if (this.lastFrameAt !== null) {
      const delta = Math.max(0, time - this.lastFrameAt)
      const bucket = document.visibilityState === 'hidden' ? this.frameTimes.hidden : this.frameTimes.visible
      boundedPush(bucket, delta, FRAME_SAMPLE_LIMIT)
    }
    this.lastFrameAt = time
    this.sampleRuntime('frame')
    this.raf = requestAnimationFrame(next => this.frame(next))
  }

  report() {
    const now = performance.now()
    const resourceEntries = performance.getEntriesByType?.('resource') || []
    const hiddenDurationMs = this.hiddenDurationMs + (this.hiddenSince === null ? 0 : Math.max(0, now - this.hiddenSince))
    const frames = [...this.frameTimes.visible, ...this.frameTimes.hidden]

    return {
      version: 1,
      session: {
        durationMs: round(now - this.startedAt),
        visibilityState: document.visibilityState || null,
      },
      boot: {
        entryAtMs: round(this.entryAt),
        appReadyAtMs: round(this.appReadyAt),
        probeReadyAtMs: round(this.startedAt),
        entryToAppReadyMs: round(this.appReadyAt - this.entryAt),
        entryToProbeReadyMs: round(this.startedAt - this.entryAt),
        entryToFirstMeasuredFrameMs: this.firstFrameAt === null ? null : round(this.firstFrameAt - this.entryAt),
        navigation: navigationMetrics(),
      },
      frames: {
        all: summarizeFrameTimes(frames),
        visible: summarizeFrameTimes(this.frameTimes.visible),
        hidden: summarizeFrameTimes(this.frameTimes.hidden),
      },
      resources: summarizeResources(resourceEntries),
      framebuffers: [...this.framebufferTransitions],
      states: [...this.stateTransitions],
      background: {
        hiddenDurationMs: round(hiddenDurationMs),
        transitions: [...this.visibilityTransitions],
        resumeLatency: summarizeFrameTimes(this.resumeLatencies),
      },
    }
  }

  stop() {
    if (this.stopped) return this.report()
    this.stopped = true
    cancelAnimationFrame(this.raf)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    return this.report()
  }
}

export function installPerformanceInstrumentation(app, timings) {
  if (!app) throw new TypeError('app is required')
  return new RuntimePerformanceInstrumentation(app, timings)
}
