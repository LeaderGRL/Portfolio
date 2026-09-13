import { test, expect } from '@playwright/test'

const supportedProjects = new Set(['chromium', 'mobile-chromium'])

test.use({
  reducedMotion: 'no-preference',
  trace: 'off',
  video: 'off',
})

async function waitForFrames(page, count = 4) {
  await page.evaluate(frameCount => new Promise(resolve => {
    const step = remaining => {
      if (remaining <= 0) return resolve()
      requestAnimationFrame(() => step(remaining - 1))
    }
    step(frameCount)
  }), count)
}

async function bootWithInstrumentation(page, path) {
  await page.addInitScript(() => {
    globalThis.__JG1500_PERF_TEST__ = true
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Performance probe: CSS fullscreen'))
  })
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#article-reader')).toBeVisible()
  await expect.poll(() => page.evaluate(() => ({
    ready: Boolean(globalThis.__JG1500_PERF__),
    error: globalThis.__JG1500_PERF_ERROR__ || null,
  }))).toEqual({ ready: true, error: null })
  await waitForFrames(page, 6)
}

async function exerciseBrowserSuspension(page) {
  await page.evaluate(() => {
    const probe = { frames: 0, lastFrameAt: null, maxGapMs: 0, running: true }
    globalThis.__JG1500_RAF_SUSPENSION_PROBE__ = probe
    const sample = time => {
      if (!probe.running) return
      if (probe.lastFrameAt !== null) probe.maxGapMs = Math.max(probe.maxGapMs, time - probe.lastFrameAt)
      probe.lastFrameAt = time
      probe.frames++
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await waitForFrames(page, 2)
  const framesBeforeSuspension = await page.evaluate(() => globalThis.__JG1500_RAF_SUSPENSION_PROBE__.frames)

  const cdp = await page.context().newCDPSession(page)
  await page.evaluate(() => globalThis.__JG1500_PERF__.markLifecycleState('suspended', 'cdp-freeze'))
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
  await new Promise(resolve => setTimeout(resolve, 500))
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  await page.evaluate(() => globalThis.__JG1500_PERF__.markLifecycleState('active', 'cdp-resume'))
  await waitForFrames(page, 4)

  const probe = await page.evaluate(() => {
    globalThis.__JG1500_RAF_SUSPENSION_PROBE__.running = false
    return globalThis.__JG1500_RAF_SUSPENSION_PROBE__
  })
  await cdp.detach()
  expect(probe.frames).toBeGreaterThan(framesBeforeSuspension)
  expect(probe.frames - framesBeforeSuspension).toBeLessThan(16)
  expect(probe.maxGapMs).toBeGreaterThan(100)
}

test('performance probe records boot, resources, rendering modes and background lifecycle', async ({ page }, testInfo) => {
  test.skip(!supportedProjects.has(testInfo.project.name), 'The performance probe covers desktop and mobile Chromium profiles')
  test.setTimeout(120_000)

  if (testInfo.project.name === 'chromium') await page.setViewportSize({ width: 960, height: 540 })
  await bootWithInstrumentation(page, '/articles/02-ecs-rust-data-oriented-design')
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false)
  // Exercise the bounded detailed-sample window without waiting a full minute.
  await page.evaluate(() => { globalThis.__JG1500_PERF__.frameSampleLimit = 12 })

  const tube = page.locator('#tube')
  const crtSwitch = page.locator('#crt-switch')
  await crtSwitch.click()
  await expect(tube).toHaveClass(/is-crt-off/)
  await waitForFrames(page)
  await crtSwitch.click()
  await expect(tube).not.toHaveClass(/is-crt-off/)

  await page.locator('#fullscreen-switch').click()
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  await waitForFrames(page)

  const media = page.locator('.document-inline-integrations button').first()
  await expect(media).toBeVisible()
  await media.click()
  await expect(tube).toHaveClass(/is-media-inspecting/)
  await waitForFrames(page)

  await exerciseBrowserSuspension(page)
  await waitForFrames(page)

  await page.keyboard.press('Escape')
  await expect(tube).not.toHaveClass(/is-media-inspecting/)
  await page.locator('.softkeys__key--exit').click()
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
  await waitForFrames(page)

  const report = await page.evaluate(() => globalThis.__JG1500_PERF__.report())
  expect(report.version).toBe(1)
  expect(report.boot.entryAtMs).toBe(0)
  expect(report.boot.entryToAppReadyMs).toBeGreaterThanOrEqual(0)
  expect(report.boot.entryToProbeReadyMs).toBeGreaterThanOrEqual(report.boot.entryToAppReadyMs)
  expect(report.boot.entryToFirstMeasuredFrameMs).toBeGreaterThanOrEqual(0)
  expect(report.boot.navigation).not.toBeNull()
  expect(report.frames.visible.samples).toBeGreaterThan(5)
  expect(report.frames.visible.p95Ms).toBeGreaterThanOrEqual(report.frames.visible.p50Ms)
  expect(report.frames.sampleWindow.retained).toBe(report.frames.samples.length)
  expect(report.frames.sampleWindow.limit).toBe(12)
  expect(report.frames.sampleWindow.dropped).toBeGreaterThan(0)
  expect(report.frames.sampleWindow.truncated).toBe(true)
  expect(report.frames.all.samples).toBeGreaterThan(report.frames.samples.length)
  expect(report.frames.byMode.some(bucket => bucket.mode.crtEnabled === false && bucket.timing.samples > 0)).toBe(true)
  expect(report.frames.byMode.some(bucket => bucket.mode.fullscreen === true && bucket.timing.samples > 0)).toBe(true)
  expect(report.frames.byMode.some(bucket => bucket.mode.displayMode === 'media' && bucket.mode.mediaOpen && bucket.timing.samples > 0)).toBe(true)
  expect(report.resources.categories.script.count).toBeGreaterThan(0)
  expect(report.resources.categories.style.count).toBeGreaterThan(0)
  expect(report.resources.categories.image.count).toBeGreaterThan(0)
  expect(report.resources.categories.instrumentation.count).toBeGreaterThan(0)
  expect(report.states.some(state => state.crtEnabled === false)).toBe(true)
  expect(report.states.some(state => state.fullscreen === true)).toBe(true)
  expect(report.states.some(state => state.displayMode === 'media' && state.mediaOpen)).toBe(true)
  expect(report.framebuffers.some(framebuffer => framebuffer.activeSource === 'document')).toBe(true)
  expect(report.framebuffers.some(framebuffer => framebuffer.output?.width > 480)).toBe(true)
  expect(report.background.visibility.transitions.at(-1)?.state).toBe('visible')
  expect(report.background.visibility.hiddenDurationMs).toBeGreaterThanOrEqual(0)
  expect(report.background.lifecycle.transitions.some(event => event.state === 'suspended')).toBe(true)
  expect(report.background.lifecycle.transitions.at(-1)?.state).toBe('active')
  expect(report.background.lifecycle.suspendedDurationMs).toBeGreaterThan(250)
  expect(report.background.lifecycle.resumeLatency.samples).toBeGreaterThan(0)

  const artifact = {
    project: testInfo.project.name,
    viewport: page.viewportSize(),
    report,
  }
  await testInfo.attach('runtime-performance-report', {
    body: Buffer.from(JSON.stringify(artifact, null, 2)),
    contentType: 'application/json',
  })
  const stoppedReport = await page.evaluate(() => globalThis.__JG1500_PERF__.stop())
  await page.waitForTimeout(50)
  expect(await page.evaluate(() => globalThis.__JG1500_PERF__.report())).toEqual(stoppedReport)
})
