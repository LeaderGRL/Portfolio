import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'

async function boot(page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toBeVisible()
  await page.waitForTimeout(700)
}

test('landscape phone keeps the complete nameplate in the safe area', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
  await page.setViewportSize({ width: 915, height: 412 })
  await boot(page)

  await expect(page.locator('#machine')).not.toHaveClass(/is-compact/)
  const nameplate = await page.locator('.nameplate').boundingBox()
  expect(nameplate).not.toBeNull()
  expect(nameplate.y).toBeGreaterThanOrEqual(0)
  expect(nameplate.y + nameplate.height).toBeLessThanOrEqual(412)
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
