import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'

async function boot(page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toBeVisible()
  await page.waitForTimeout(700)
}

async function expectInsideViewport(locator, width, height, tolerance = 1) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box.x).toBeGreaterThanOrEqual(-tolerance)
  expect(box.y).toBeGreaterThanOrEqual(-tolerance)
  expect(box.x + box.width).toBeLessThanOrEqual(width + tolerance)
  expect(box.y + box.height).toBeLessThanOrEqual(height + tolerance)
  return box
}

for (const viewport of [
  { width: 740, height: 480, variant: '3x2' },
  { width: 667, height: 375, variant: '16x9' },
  { width: 915, height: 412, variant: '21x9' },
]) {
  test(`landscape ${viewport.width}x${viewport.height} uses the ${viewport.variant} authored chassis`, async ({ page }, testInfo) => {
    test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await boot(page)

    const machine = page.locator('#machine')
    await expect(machine).toHaveClass(/is-landscape-mobile/)
    await expect(machine).not.toHaveClass(/is-compact/)
    await expect(machine).toHaveAttribute('data-landscape-variant', viewport.variant)
    await expect(page.locator('body')).toHaveClass(/is-landscape-mobile-stage/)

    await expectInsideViewport(machine, viewport.width, viewport.height)
    await expectInsideViewport(page.locator('.nameplate'), viewport.width, viewport.height)

    const screen = await expectInsideViewport(page.locator('#screen'), viewport.width, viewport.height, 6)
    expect(screen.width).toBeGreaterThan(260)
    expect(screen.height).toBeGreaterThan(160)

    const keys = page.locator('#nav-keys .key, #action-keys .key')
    await expect(keys).toHaveCount(8)
    const keyBoxes = await keys.evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    }))
    for (const box of keyBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1)
      expect(box.top).toBeGreaterThanOrEqual(-1)
      expect(box.right).toBeLessThanOrEqual(viewport.width + 1)
      expect(box.bottom).toBeLessThanOrEqual(viewport.height + 1)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test('rotating a phone returns from landscape chassis to portrait compact chassis', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
  await page.setViewportSize({ width: 915, height: 412 })
  await boot(page)
  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)

  await page.setViewportSize({ width: 412, height: 915 })
  await expect(page.locator('#machine')).toHaveClass(/is-compact/)
  await expect(page.locator('#machine')).not.toHaveClass(/is-landscape-mobile/)
  await expect(page.locator('body')).not.toHaveClass(/is-landscape-mobile-stage/)
})

test('landscape article remains inside the CRT and keeps native document scrolling', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
  await page.setViewportSize({ width: 915, height: 412 })
  await boot(page, '/articles/01-ecs-entity-management')

  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)
  const reader = page.locator('#article-reader')
  await expect(reader).toBeVisible()

  const geometry = await reader.evaluate(element => ({
    overflowY: getComputedStyle(element).overflowY,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    fontSize: parseFloat(getComputedStyle(element).fontSize),
  }))
  expect(['auto', 'scroll']).toContain(geometry.overflowY)
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight)
  expect(geometry.fontSize).toBeGreaterThanOrEqual(28)

  const before = await reader.evaluate(element => element.scrollTop)
  await reader.evaluate(element => { element.scrollTop += Math.max(80, element.clientHeight * 0.5) })
  const after = await reader.evaluate(element => element.scrollTop)
  expect(after).toBeGreaterThan(before)
})

test('article code stays in the visible CRT document flow and is axe-clean', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Accessibility regression only needs one browser engine')
  await boot(page, '/articles/01-ecs-entity-management')

  const codeRegions = page.locator('.article-reader__code')
  await expect(codeRegions.first()).toBeAttached()

  const geometry = await codeRegions.evaluateAll(regions => regions.map(region => ({
    tabIndex: region.getAttribute('tabindex'),
    overflowX: getComputedStyle(region).overflowX,
    overflowY: getComputedStyle(region).overflowY,
    scrollWidth: region.scrollWidth,
    clientWidth: region.clientWidth,
  })))

  expect(geometry.length).toBeGreaterThan(0)
  for (const region of geometry) {
    expect(region.tabIndex).toBeNull()
    expect(region.overflowX).not.toBe('auto')
    expect(region.overflowX).not.toBe('scroll')
    expect(region.overflowY).not.toBe('auto')
    expect(region.overflowY).not.toBe('scroll')
    expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth + 1)
  }

  const results = await new AxeBuilder({ page }).analyze()
  const scrollViolations = results.violations.filter(violation => violation.id === 'scrollable-region-focusable')
  expect(scrollViolations).toEqual([])
})
