import { test, expect } from '@playwright/test'

const supportedProjects = new Set(['chromium', 'mobile-chromium'])

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

async function setSyntheticVisibility(page, state) {
  await page.evaluate(nextState => {
    globalThis.__JG1500_TEST_VISIBILITY__ = nextState
    if (!globalThis.__JG1500_TEST_VISIBILITY_INSTALLED__) {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => globalThis.__JG1500_TEST_VISIBILITY__,
      })
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => globalThis.__JG1500_TEST_VISIBILITY__ === 'hidden',
      })
      globalThis.__JG1500_TEST_VISIBILITY_INSTALLED__ = true
    }
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

test('performance probe records boot, resources, rendering modes and background lifecycle', async ({ page }, testInfo) => {
  test.skip(!supportedProjects.has(testInfo.project.name), 'The performance probe covers desktop and mobile Chromium profiles')
  test.setTimeout(120_000)

  if (testInfo.project.name === 'chromium') await page.setViewportSize({ width: 960, height: 540 })
  await bootWithInstrumentation(page, '/articles/02-ecs-rust-data-oriented-design')

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

  const foregroundState = await page.evaluate(() => document.visibilityState)
  expect(foregroundState).toBe('visible')
  await setSyntheticVisibility(page, 'hidden')
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden')
  await setSyntheticVisibility(page, 'visible')
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible')
  await waitForFrames(page)

  await page.keyboard.press('Escape')
  await expect(tube).not.toHaveClass(/is-media-inspecting/)
  await page.locator('.softkeys__key--exit').click()
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
  await waitForFrames(page)

  const report = await page.evaluate(() => globalThis.__JG1500_PERF__.report())
  expect(report.version).toBe(1)
  expect(report.boot.entryToAppReadyMs).toBeGreaterThanOrEqual(0)
  expect(report.boot.entryToProbeReadyMs).toBeGreaterThanOrEqual(report.boot.entryToAppReadyMs)
  expect(report.boot.entryToFirstMeasuredFrameMs).toBeGreaterThanOrEqual(0)
  expect(report.boot.navigation).not.toBeNull()
  expect(report.frames.visible.samples).toBeGreaterThan(5)
  expect(report.frames.visible.p95Ms).toBeGreaterThanOrEqual(report.frames.visible.p50Ms)
  expect(report.resources.categories.script.count).toBeGreaterThan(0)
  expect(report.resources.categories.style.count).toBeGreaterThan(0)
  expect(report.resources.categories.image.count).toBeGreaterThan(0)
  expect(report.resources.categories.instrumentation.count).toBeGreaterThan(0)
  expect(report.states.some(state => state.crtEnabled === false)).toBe(true)
  expect(report.states.some(state => state.fullscreen === true)).toBe(true)
  expect(report.states.some(state => state.displayMode === 'media' && state.mediaOpen)).toBe(true)
  expect(report.framebuffers.some(framebuffer => framebuffer.activeSource === 'document')).toBe(true)
  expect(report.framebuffers.some(framebuffer => framebuffer.output?.width > 480)).toBe(true)
  expect(report.background.transitions.some(event => event.state === 'hidden')).toBe(true)
  expect(report.background.transitions.at(-1)?.state).toBe('visible')
  expect(report.background.hiddenDurationMs).toBeGreaterThanOrEqual(0)
  expect(report.background.resumeLatency.samples).toBeGreaterThan(0)

  const artifact = {
    project: testInfo.project.name,
    viewport: page.viewportSize(),
    report,
  }
  await testInfo.attach('runtime-performance-report', {
    body: Buffer.from(JSON.stringify(artifact, null, 2)),
    contentType: 'application/json',
  })
  await page.evaluate(() => globalThis.__JG1500_PERF__.stop())
})
