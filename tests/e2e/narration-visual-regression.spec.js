import { test, expect } from '@playwright/test'

const DESKTOP = { width: 1440, height: 900 }
const PIXEL_7 = { width: 412, height: 915 }
const FIXTURE_SRC = '/media/Astro/menu.mp3'
const FIXTURE_ID = 'astro-visual-regression'
const CAPTURE_PADDING = 12

async function installStableNarrationHarness(page) {
  await page.addInitScript(() => {
    globalThis.__JG1500_VISUAL_TEST__ = true
  })
}

async function bootNarration(page) {
  await page.goto('/projects/astro')
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await expect(page.locator('#article-reader')).toBeAttached()
  await page.evaluate(() => document.fonts?.ready)

  await page.evaluate(({ id, source }) => {
    const app = globalThis.__JG1500_APP__
    const current = app?.state?.item
    if (!app || !current) throw new Error('JG-1500 visual runtime is unavailable')

    app.state.item = {
      ...current,
      id,
      narration: source,
    }
    app.dirty = true
    app.__articleCRTBridge?.syncSource()
    app.__articleCRTBridge?.documentRaster?.markDirty()
  }, { id: FIXTURE_ID, source: FIXTURE_SRC })

  await expect(page.locator('.document-narration-layer')).toBeVisible()
  await expect(page.locator('.document-narration-toggle')).toBeVisible()
  await settle(page)
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
}

async function activateAndFreeze(page) {
  const toggle = page.locator('.document-narration-toggle')
  await toggle.click({ force: true })
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')
  await expect(page.locator('.document-narration-progress')).toBeVisible()

  await page.locator('.document-narration-progress').evaluate(node => {
    node.value = String(Math.min(5, Number(node.max) || 5))
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await toggle.click({ force: true })
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')
  await settle(page)
}

const snapshotOptions = {
  maxDiffPixelRatio: 0.01,
  threshold: 0.22,
}

async function captureNarrationPlayer(page) {
  await settle(page)
  const controlsBox = await page.locator('.document-narration-controls').boundingBox()
  const tubeBox = await page.locator('#tube').boundingBox()
  if (!controlsBox || !tubeBox) throw new Error('Narration visual geometry is unavailable')

  const tubeRight = tubeBox.x + tubeBox.width
  const tubeBottom = tubeBox.y + tubeBox.height
  const left = Math.max(tubeBox.x, controlsBox.x - CAPTURE_PADDING)
  const top = Math.max(tubeBox.y, controlsBox.y - CAPTURE_PADDING)
  const right = Math.min(tubeRight, controlsBox.x + controlsBox.width + CAPTURE_PADDING)
  const bottom = Math.min(tubeBottom, controlsBox.y + controlsBox.height + CAPTURE_PADDING)

  expect(controlsBox.x).toBeGreaterThanOrEqual(tubeBox.x)
  expect(controlsBox.y).toBeGreaterThanOrEqual(tubeBox.y)
  expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(tubeRight)
  expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(tubeBottom)

  return page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip: {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
  })
}

async function expectNarrationSnapshot(page, name) {
  expect(await captureNarrationPlayer(page)).toMatchSnapshot(name, snapshotOptions)
}

test.describe('desktop narration visual states', () => {
  test.use({
    viewport: DESKTOP,
    screen: DESKTOP,
    hasTouch: false,
    isMobile: false,
  })

  test.beforeEach(async ({ page }) => {
    await installStableNarrationHarness(page)
    await bootNarration(page)
  })

  test('idle NARRATE matches the approved CRT composition', async ({ page }) => {
    await expectNarrationSnapshot(page, 'narration-desktop-idle.png')
  })

  test('activated main player matches the approved CRT composition', async ({ page }) => {
    await activateAndFreeze(page)
    await expect(page.locator('.document-narration-controls')).toHaveAttribute('data-narration-presentation', 'primary')
    await expectNarrationSnapshot(page, 'narration-desktop-active.png')
  })

  test('sticky player matches the approved CRT composition', async ({ page }) => {
    await activateAndFreeze(page)
    await page.locator('#article-reader').evaluate(node => { node.scrollTop = node.scrollHeight })
    await expect(page.locator('.document-narration-controls')).toHaveAttribute('data-narration-presentation', 'sticky')
    await settle(page)
    await expectNarrationSnapshot(page, 'narration-desktop-sticky.png')
  })
})

test.describe('Pixel 7 narration visual states', () => {
  test.use({
    viewport: PIXEL_7,
    screen: PIXEL_7,
    hasTouch: true,
    isMobile: true,
  })

  test.beforeEach(async ({ page }) => {
    await installStableNarrationHarness(page)
    await bootNarration(page)
  })

  test('active main player stays inside the portrait CRT', async ({ page }) => {
    await activateAndFreeze(page)
    await expect(page.locator('.document-narration-controls')).toHaveAttribute('data-narration-presentation', 'primary')
    await expectNarrationSnapshot(page, 'narration-mobile-active.png')
  })

  test('sticky player stays inside the portrait CRT', async ({ page }) => {
    await activateAndFreeze(page)
    await page.locator('#article-reader').evaluate(node => { node.scrollTop = node.scrollHeight })
    await expect(page.locator('.document-narration-controls')).toHaveAttribute('data-narration-presentation', 'sticky')
    await settle(page)
    await expectNarrationSnapshot(page, 'narration-mobile-sticky.png')
  })
})
