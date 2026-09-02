import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'
const isMobile = testInfo => testInfo.project.name === 'mobile-chromium'

async function boot(page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toBeVisible()
  await page.waitForTimeout(700)
}

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

// A 16:9 viewport that stays light for software-GL runners: the full-screen
// shader covers the whole viewport, so its cost scales with this size. The
// desktop scenarios run on one engine for the same reason — every CI project
// is on SwiftShader, and the mobile device profile multiplies the canvas by
// its device pixel ratio.
const DESKTOP = { width: 960, height: 540 }

test('full screen fills the viewport with glass and keeps the raster at 4:3', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
  await page.setViewportSize(DESKTOP)
  await boot(page)

  const fullscreenSwitch = page.locator('#fullscreen-switch')
  await expect(fullscreenSwitch).toHaveAttribute('aria-checked', 'false')
  await fullscreenSwitch.click()

  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  await expect(fullscreenSwitch).toHaveAttribute('aria-checked', 'true')

  // The whole viewport is glass; the chassis is set aside.
  const tube = await page.locator('#tube').boundingBox()
  expect(tube).not.toBeNull()
  expect(Math.round(tube.x)).toBe(0)
  expect(Math.round(tube.y)).toBe(0)
  expect(Math.round(tube.width)).toBe(DESKTOP.width)
  expect(Math.round(tube.height)).toBe(DESKTOP.height)
  await expect(page.locator('.panel--left')).toBeHidden()
  await expect(page.locator('.panel--right')).toBeHidden()

  // The DOM layers that register with the picture take the raster rectangle:
  // 4:3, height-limited on a 16:9 viewport, centred.
  const surface = await page.locator('.display-surface').boundingBox()
  expect(surface).not.toBeNull()
  expect(Math.round(surface.height)).toBe(DESKTOP.height)
  expect(Math.round(surface.width)).toBe(DESKTOP.height * 4 / 3)
  expect(Math.round(surface.x)).toBe((DESKTOP.width - DESKTOP.height * 4 / 3) / 2)

  // Navigation stays available on the glass.
  const softkeys = page.locator('#softkeys')
  await expect(softkeys).toBeVisible()
  await expect(softkeys.locator('[aria-current="page"]')).toHaveText(/HOME/)
  await softkeys.locator('[data-route="about"]').click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(softkeys.locator('[aria-current="page"]')).toHaveText(/ABOUT/)

  await softkeys.locator('.softkeys__key--exit').click()
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
  await expect(fullscreenSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.panel--left')).toBeVisible()
})

test('escape leaves full screen before it means BACK', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Keyboard regression only needs one browser engine')
  await page.setViewportSize(DESKTOP)
  await boot(page, '/articles/01-ecs-entity-management')

  await page.keyboard.press('f')
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)

  await page.keyboard.press('Escape')
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
  await expect(page).toHaveURL(/\/articles\/01-ecs-entity-management$/)

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/articles$/)
})

test('full screen switch sits on its own tier on the portable panel', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'Portable geometry regression only needs the mobile engine')
  await boot(page)

  const boxes = {}
  for (const id of ['crt-switch', 'fullscreen-switch', 'volume', 'power']) {
    boxes[id] = await page.locator(`#${id}`).boundingBox()
    expect(boxes[id], id).not.toBeNull()
  }
  const viewport = page.viewportSize()
  for (const [id, box] of Object.entries(boxes)) {
    expect(box.x, `${id} inside viewport`).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, `${id} inside viewport`).toBeLessThanOrEqual(viewport.width)
  }
  expect(overlaps(boxes['crt-switch'], boxes['fullscreen-switch'])).toBe(false)
  expect(overlaps(boxes['fullscreen-switch'], boxes['volume'])).toBe(false)
  expect(overlaps(boxes['fullscreen-switch'], boxes['power'])).toBe(false)
  expect(boxes['power'].y).toBeGreaterThan(boxes['fullscreen-switch'].y + boxes['fullscreen-switch'].height)

  await page.locator('#fullscreen-switch').tap()
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  // Width-limited on a portrait viewport: the raster spans the full width.
  const surface = await page.locator('.display-surface').boundingBox()
  expect(Math.round(surface.width)).toBe(viewport.width)
  expect(Math.round(surface.height)).toBe(Math.round(viewport.width * 3 / 4))
  await expect(page.locator('#softkeys')).toBeVisible()
  await page.locator('.softkeys__key--exit').tap()
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
})

test('full screen mode is axe-clean', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Accessibility regression only needs one browser engine')
  await page.setViewportSize(DESKTOP)
  await boot(page)
  await page.keyboard.press('f')
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)

  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
  expect(serious).toEqual([])
})
