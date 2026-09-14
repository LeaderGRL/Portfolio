import { test, expect } from '@playwright/test'

async function bootNarratableDocument(page) {
  await page.addInitScript(() => {
    window.__JG1500_VISUAL_TEST__ = true

    const NativeAudio = window.Audio
    function TrackedAudio(...args) {
      return new NativeAudio(...args)
    }
    TrackedAudio.prototype = NativeAudio.prototype
    Object.setPrototypeOf(TrackedAudio, NativeAudio)
    window.Audio = TrackedAudio
  })

  await page.goto('/projects/astro')
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')

  await page.evaluate(() => {
    const app = window.__JG1500_APP__
    const current = app?.state?.item
    if (!app || !current) throw new Error('JG-1500 test runtime is unavailable')

    app.state.item = {
      ...current,
      id: `${current.id}-sticky-transition-test`,
      narration: '/media/Astro/menu.mp3',
    }
    app.dirty = true
    app.__articleCRTBridge?.syncSource()
  })
}

async function setRasterScroll(page, target) {
  await page.evaluate(rasterTarget => {
    const runtime = window.__JG1500_APP__?.__articleCRTBridge
    const rasteriser = runtime?.documentRaster
    const reader = rasteriser?.reader
    if (!runtime || !rasteriser || !reader) throw new Error('Document raster runtime is unavailable')

    const clamped = Math.max(0, Math.min(rasteriser.maxScroll, rasterTarget))
    const domMax = Math.max(0, reader.scrollHeight - reader.clientHeight)
    reader.scrollTop = rasteriser.maxScroll > 0 ? (clamped / rasteriser.maxScroll) * domMax : 0
    rasteriser._syncScrollFromDOM()
    runtime.narrationPlayer.sync()
    runtime.app.dirty = true
  }, target)
}

test('sticky narration takes over as soon as primary controls leave the painted clip', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Sticky transition contract only needs Chromium')
  await bootNarratableDocument(page)

  const toggle = page.locator('.document-narration-toggle')
  const host = page.locator('.document-narration-controls')
  await expect(toggle).toBeVisible()
  await toggle.click({ force: true })
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')

  const threshold = await page.evaluate(() => {
    const runtime = window.__JG1500_APP__?.__articleCRTBridge
    const player = runtime?.narrationPlayer
    const entry = player?.entry
    if (!player || !entry) return null

    const metrics = player.controlMetrics({
      kind: 'primary',
      x: entry.x,
      y: 0,
      width: entry.width,
      height: entry.height,
    }, true)
    const controlBottom = Math.max(
      metrics.buttonTop + metrics.buttonHeight,
      metrics.progressTop + metrics.progressHeight,
    )
    return entry.y - (20 - controlBottom)
  })
  expect(threshold).not.toBeNull()

  await setRasterScroll(page, threshold - 1)
  await expect(host).toHaveAttribute('data-narration-presentation', 'primary')

  await setRasterScroll(page, threshold + 1)
  await expect(host).toHaveAttribute('data-narration-presentation', 'sticky')
  await expect(toggle).toBeVisible()
  await expect(page.locator('.document-narration-progress')).toBeVisible()
})
