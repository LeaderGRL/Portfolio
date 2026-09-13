import { test, expect } from '@playwright/test'

test('local 3D runtime loads only when a document needs it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Chunk loading only needs one browser engine')

  await page.addInitScript(() => {
    globalThis.__JG1500_VISUAL_TEST__ = true
  })

  const runtimeRequests = []
  page.on('request', request => {
    if (/\/assets\/local-3d-[^/?]+\.js(?:\?|$)/.test(request.url())) runtimeRequests.push(request.url())
  })

  await page.goto('/')
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#nav-keys .key.is-on')).toHaveAttribute('aria-label', 'HOME')
  await page.waitForLoadState('networkidle')
  expect(runtimeRequests).toEqual([])

  await page.goto('/projects/penw')
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')

  await expect.poll(() => page.evaluate(() => (
    Boolean(globalThis.__JG1500_APP__?.documentRuntime?.local3d?.manager)
  ))).toBe(true)

  await page.evaluate(() => {
    const runtime = globalThis.__JG1500_APP__.documentRuntime
    const modelEntry = runtime.documentRaster.layout.find(entry => entry.type === 'model3d')
    const rasterScroll = Math.max(0, modelEntry.y - 40)
    const domMax = Math.max(0, runtime.reader.scrollHeight - runtime.reader.clientHeight)
    runtime.reader.scrollTop = runtime.documentRaster.maxScroll
      ? rasterScroll / runtime.documentRaster.maxScroll * domMax
      : 0
  })

  await expect(page.locator('.document-model3d-input-proxy')).toBeAttached()
  await expect.poll(() => page.evaluate(() => {
    const runtime = globalThis.__JG1500_APP__.documentRuntime
    const modelEntry = runtime.documentRaster.layout.find(entry => entry.type === 'model3d')
    const manager = runtime.local3d.manager
    const scene = manager.scenes.get(manager.key(modelEntry.block))
    return { ready: Boolean(scene?.ready), failed: Boolean(scene?.failed) }
  }), { timeout: 15_000 }).toEqual({ ready: true, failed: false })

  expect(new Set(runtimeRequests).size).toBe(1)
})
