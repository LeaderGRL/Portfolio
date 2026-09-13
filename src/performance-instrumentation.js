const FRAME_SAMPLE_LIMIT = 3600
const TRANSITION_LIMIT = 256
const RUNTIME_SAMPLE_INTERVAL_MS = 250

const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null

const boundedPush = (items, value, limit) => {
  items.push(value)
  if (items.length > limit) {
    items.shift()
    return true
  }
  return false
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
  if (initiator === 'img' || /\.(?:avif|gif|jpe?g|png|svg|webp)$/.test(name)) return 'image'
  if (initiator === 'video' || initiator === 'audio' || /\.(?:mp3|mp4|ogg|wav|webm)$/.test(name)) return 'media'
  if (/\.(?:glb|gltf|bin)$/.test(name)) return 'model'
  if (initiator === 'css' || initiator === 'link' && name.endsWith('.css') || name.endsWith('.css')) return 'style'
  if (initiator === 'fetch' || initiator === 'xmlhttprequest' || /\.json$/.test(name)) return 'data'
  return 'other'
}

const frameModeFromState = state => ({
  crtEnabled: Boolean(state?.crtEnabled),
  powerEnabled: Boolean(state?.powerEnabled),
  fullscreen: Boolean(state?.fullscreen),
  displayMode: state?.displayMode || 'terminal',
  mediaOpen: Boolean(state?.mediaOpen),
})

const frameModeKey = mode => JSON.stringify(mode)

export function summarizeFrameSamplesByMode(samples) {
  const buckets = new Map()
  for (const sample of samples || []) {
    if (!Number.isFinite(sample?.deltaMs) || sample.deltaMs < 0) continue
    const mode = frameModeFromState(sample.mode)
    const key = frameModeKey(mode)
    if (!buckets.has(key)) buckets.set(key, { mode, values: [] })
    buckets.get(key).values.push(sample.deltaMs)
  }
  return [...buckets.values()].map(({ mode, values }) => ({
    mode,
    timing: summarizeFrameTimes(values),
  }))
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
    this.lastFrameMode = null
    this.lastFrameModeKey = null
    this.frameSamples = []
    this.frameSampleLimit = FRAME_SAMPLE_LIMIT
    // Keep compact timing values for exact whole-session summaries while the
    // richer per-frame records remain bounded for report size and memory use.
    this.frameTimes = []
    this.visibleFrameTimes = []
    this.hiddenFrameTimes = []
    this.frameTimesByMode = new Map()
    this.droppedFrameSamples = 0
    this.stateTransitions = []
    this.framebufferTransitions = []
    this.visibilityTransitions = []
    this.hiddenDurationMs = 0
    this.hiddenSince = document.visibilityState === 'hidden' ? this.startedAt : null
    this.pendingVisibilityResumeAt = null
    this.visibilityResumeLatencies = []
    this.lifecycleTransitions = []
    this.suspendedDurationMs = 0
    this.suspendedSince = null
    this.pendingLifecycleResumeAt = null
    this.lifecycleResumeLatencies = []
    this.lastStateSignature = ''
    this.lastFramebufferSignature = ''
    this.tube = document.getElementById('tube')
    this.currentVisibility = document.visibilityState || (document.hidden ? 'hidden' : 'visible')
    this.currentFrameMode = null
    this.currentFrameModeKey = null
    this.runtimeSampleQueued = false
    this.stopped = false
    this.stoppedAt = null
    this.finalReport = null

    performance.setResourceTimingBufferSize?.(1000)

    this.onVisibilityChange = () => this.recordVisibility('visibilitychange')
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.recordVisibility('install')
    this.sampleRuntime('install')

    this.onRuntimeMutation = () => this.scheduleRuntimeSample('mutation')
    this.runtimeObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(this.onRuntimeMutation)
    if (this.runtimeObserver) {
      if (document.body) {
        this.runtimeObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['class'],
        })
      }
      if (this.tube) {
        this.runtimeObserver.observe(this.tube, {
          attributes: true,
          attributeFilter: ['class', 'data-display-mode', 'data-raster-layout'],
        })
      }
    }
    this.onResize = () => this.scheduleRuntimeSample('resize')
    globalThis.addEventListener?.('resize', this.onResize, { passive: true })
    this.runtimeTimer = globalThis.setInterval?.(
      () => this.sampleRuntime('interval'),
      RUNTIME_SAMPLE_INTERVAL_MS,
    ) ?? null
    this.raf = requestAnimationFrame(time => this.frame(time))
  }

  recordVisibility(trigger) {
    const at = performance.now()
    const state = document.visibilityState || (document.hidden ? 'hidden' : 'visible')
    const previous = this.visibilityTransitions.at(-1)?.state || null
    this.currentVisibility = state

    if (state !== previous || trigger === 'install') {
      boundedPush(this.visibilityTransitions, { atMs: round(at), state, trigger }, TRANSITION_LIMIT)
    }

    if (state === 'hidden' && this.hiddenSince === null) this.hiddenSince = at
    if (state === 'visible' && this.hiddenSince !== null) {
      this.hiddenDurationMs += Math.max(0, at - this.hiddenSince)
      this.hiddenSince = null
      this.pendingVisibilityResumeAt = at
    }

    // Do not fold time spent in a background tab into foreground frame time.
    this.lastFrameAt = null
    this.lastFrameMode = null
    this.lastFrameModeKey = null
  }

  markLifecycleState(state, trigger = 'measurement-harness') {
    if (state !== 'suspended' && state !== 'active') {
      throw new TypeError('lifecycle state must be suspended or active')
    }

    const at = performance.now()
    const previous = this.lifecycleTransitions.at(-1)?.state || null
    if (state !== previous) {
      boundedPush(this.lifecycleTransitions, { atMs: round(at), state, trigger }, TRANSITION_LIMIT)
    }

    if (state === 'suspended' && this.suspendedSince === null) this.suspendedSince = at
    if (state === 'active' && this.suspendedSince !== null) {
      this.suspendedDurationMs += Math.max(0, at - this.suspendedSince)
      this.suspendedSince = null
      this.pendingLifecycleResumeAt = at
    }

    // A renderer suspension is an intentional discontinuity in frame timing.
    this.lastFrameAt = null
    this.lastFrameMode = null
    this.lastFrameModeKey = null
  }

  scheduleRuntimeSample(trigger) {
    if (this.stopped || this.runtimeSampleQueued) return
    this.runtimeSampleQueued = true
    queueMicrotask(() => {
      this.runtimeSampleQueued = false
      if (!this.stopped) this.sampleRuntime(trigger)
    })
  }

  updateFrameMode(state) {
    const mode = frameModeFromState(state)
    const key = frameModeKey(mode)
    this.currentFrameMode = mode
    this.currentFrameModeKey = key
    if (!this.frameTimesByMode.has(key)) {
      this.frameTimesByMode.set(key, { mode, values: [] })
    }
  }

  stateSnapshot(trigger) {
    const { state = {} } = this.app
    const tube = this.tube || (this.tube = document.getElementById('tube'))
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
    this.updateFrameMode(state)
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
    return state
  }

  frame(time) {
    if (this.stopped) return
    if (this.firstFrameAt === null) this.firstFrameAt = time

    if (this.pendingVisibilityResumeAt !== null && document.visibilityState !== 'hidden') {
      boundedPush(this.visibilityResumeLatencies, Math.max(0, time - this.pendingVisibilityResumeAt), TRANSITION_LIMIT)
      this.pendingVisibilityResumeAt = null
    }
    if (this.pendingLifecycleResumeAt !== null) {
      boundedPush(this.lifecycleResumeLatencies, Math.max(0, time - this.pendingLifecycleResumeAt), TRANSITION_LIMIT)
      this.pendingLifecycleResumeAt = null
    }
    if (this.lastFrameAt !== null && this.lastFrameMode && this.lastFrameModeKey) {
      const delta = Math.max(0, time - this.lastFrameAt)
      const roundedDelta = round(delta)
      const visibility = this.currentVisibility
      this.frameTimes.push(roundedDelta)
      if (visibility === 'hidden') this.hiddenFrameTimes.push(roundedDelta)
      else this.visibleFrameTimes.push(roundedDelta)
      const modeBucket = this.frameTimesByMode.get(this.lastFrameModeKey)
      if (modeBucket) modeBucket.values.push(roundedDelta)
      if (boundedPush(this.frameSamples, {
        atMs: round(time),
        deltaMs: roundedDelta,
        visibility,
        mode: this.lastFrameMode,
      }, this.frameSampleLimit)) this.droppedFrameSamples++
    }
    this.lastFrameAt = time
    this.lastFrameMode = this.currentFrameMode
    this.lastFrameModeKey = this.currentFrameModeKey
    this.raf = requestAnimationFrame(next => this.frame(next))
  }

  createReport(now) {
    const resourceEntries = performance.getEntriesByType?.('resource') || []
    const hiddenDurationMs = this.hiddenDurationMs + (this.hiddenSince === null ? 0 : Math.max(0, now - this.hiddenSince))
    const suspendedDurationMs = this.suspendedDurationMs + (this.suspendedSince === null ? 0 : Math.max(0, now - this.suspendedSince))
    const frameSamples = this.frameSamples.map(sample => ({ ...sample, mode: { ...sample.mode } }))
    const frameModes = [...this.frameTimesByMode.values()].map(({ mode, values }) => ({
      mode: { ...mode },
      timing: summarizeFrameTimes(values),
    }))
    const firstRetainedSample = frameSamples[0] || null
    const lastRetainedSample = frameSamples.at(-1) || null

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
        all: summarizeFrameTimes(this.frameTimes),
        visible: summarizeFrameTimes(this.visibleFrameTimes),
        hidden: summarizeFrameTimes(this.hiddenFrameTimes),
        byMode: frameModes,
        samples: frameSamples,
        sampleWindow: {
          limit: this.frameSampleLimit,
          retained: frameSamples.length,
          dropped: this.droppedFrameSamples,
          truncated: this.droppedFrameSamples > 0,
          firstRetainedAtMs: firstRetainedSample?.atMs ?? null,
          lastRetainedAtMs: lastRetainedSample?.atMs ?? null,
        },
      },
      resources: summarizeResources(resourceEntries),
      framebuffers: [...this.framebufferTransitions],
      states: [...this.stateTransitions],
      background: {
        visibility: {
          hiddenDurationMs: round(hiddenDurationMs),
          transitions: [...this.visibilityTransitions],
          resumeLatency: summarizeFrameTimes(this.visibilityResumeLatencies),
        },
        lifecycle: {
          suspendedDurationMs: round(suspendedDurationMs),
          transitions: [...this.lifecycleTransitions],
          resumeLatency: summarizeFrameTimes(this.lifecycleResumeLatencies),
        },
      },
    }
  }

  report() {
    return this.finalReport || this.createReport(performance.now())
  }

  stop() {
    if (this.finalReport) return this.finalReport
    this.stopped = true
    cancelAnimationFrame(this.raf)
    if (this.runtimeTimer !== null) globalThis.clearInterval?.(this.runtimeTimer)
    this.runtimeObserver?.disconnect()
    globalThis.removeEventListener?.('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.stoppedAt = performance.now()
    this.finalReport = this.createReport(this.stoppedAt)
    return this.finalReport
  }
}

export function installPerformanceInstrumentation(app, timings) {
  if (!app) throw new TypeError('app is required')
  return new RuntimePerformanceInstrumentation(app, timings)
}
