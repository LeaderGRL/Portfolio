import { test, expect } from '@playwright/test'

test('sticky narration masks inline integrations and restores their full aperture', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Sticky overlay ownership only needs one desktop browser engine')

  await page.addInitScript(() => {
    window.__JG1500_VISUAL_TEST__ = true

    const NativeAudio = window.Audio
    function TestAudio(...args) {
      return new NativeAudio(...args)
    }
    TestAudio.prototype = NativeAudio.prototype
    Object.setPrototypeOf(TestAudio, NativeAudio)
    window.Audio = TestAudio
  })

  await page.goto('/projects/astro')
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')

  await page.evaluate(() => {
    const app = window.__JG1500_APP__
    if (!app?.state?.item) throw new Error('JG-1500 test runtime is unavailable')
    app.state.item = {
      ...app.state.item,
      id: `${app.state.item.id}-sticky-overlay-test`,
      narration: '/media/Astro/menu.mp3',
    }
    app.dirty = true
    app.__articleCRTBridge?.syncSource()
  })

  const toggle = page.locator('.document-narration-toggle')
  const host = page.locator('.document-narration-controls')
  const reader = page.locator('#article-reader')
  await expect(toggle).toBeVisible()
  await toggle.click({ force: true })
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')

  await reader.evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(host).toHaveAttribute('data-narration-presentation', 'sticky')

  await expect.poll(() => page.evaluate(() => {
    const runtime = window.__JG1500_APP__?.__articleCRTBridge
    return {
      narrationInset: runtime?.narrationPlayer?.overlayTopInset || 0,
      integrationInset: runtime?.inlineIntegrations?.topInset || 0,
      clipPath: runtime?.inlineIntegrations?.layer?.style?.clipPath || '',
    }
  })).toMatchObject({
    narrationInset: expect.any(Number),
    integrationInset: expect.any(Number),
  })

  const sticky = await page.evaluate(() => {
    const runtime = window.__JG1500_APP__?.__articleCRTBridge
    return {
      narrationInset: runtime?.narrationPlayer?.overlayTopInset || 0,
      integrationInset: runtime?.inlineIntegrations?.topInset || 0,
      clipPath: runtime?.inlineIntegrations?.layer?.style?.clipPath || '',
    }
  })
  expect(sticky.narrationInset).toBeGreaterThan(0)
  expect(sticky.integrationInset).toBeCloseTo(sticky.narrationInset, 5)
  expect(sticky.clipPath).toMatch(/^inset\((?!0\.000000%)/)

  await reader.evaluate(node => { node.scrollTop = 0 })
  await expect(host).toHaveAttribute('data-narration-presentation', 'primary')
  await expect.poll(() => page.evaluate(() => {
    const runtime = window.__JG1500_APP__?.__articleCRTBridge
    return runtime?.inlineIntegrations?.topInset || 0
  })).toBe(0)
})
