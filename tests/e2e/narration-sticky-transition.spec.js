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

test('sticky narration takes over as soon as primary controls leave the painted clip', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Sticky transition contract only needs Chromium')
  await bootNarratableDocument(page)

  const toggle = page.locator('.document-narration-toggle')
  const host = page.locator('.document-narration-controls')
  await expect(toggle).toBeVisible()
  await toggle.click({ force: true })
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')

  const thresholds = await page.evaluate(() => {
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
    return {
      before: entry.y - (20 - controlBottom + 1),
      atClip: entry.y - (20 - controlBottom),
    }
  })
  expect(thresholds).not.toBeNull()

  const reader = page.locator('#article-reader')
  await reader.evaluate((node, scrollTop) => { node.scrollTop = scrollTop }, thresholds.before)
  await expect(host).toHaveAttribute('data-narration-presentation', 'primary')

  await reader.evaluate((node, scrollTop) => { node.scrollTop = scrollTop }, thresholds.atClip)
  await expect(host).toHaveAttribute('data-narration-presentation', 'sticky')
  await expect(toggle).toBeVisible()
  await expect(page.locator('.document-narration-progress')).toBeVisible()
})
