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

test('article code regions are keyboard focusable and axe-clean', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Accessibility regression only needs one browser engine')
  await boot(page, '/articles/01-ecs-entity-management')

  const codeRegions = page.locator('.article-reader__code')
  await expect(codeRegions.first()).toBeAttached()
  expect(await codeRegions.count()).toBeGreaterThan(0)
  for (const region of await codeRegions.all()) {
    await expect(region).toHaveAttribute('tabindex', '0')
    await expect(region).toHaveAttribute('aria-label', /.+/)
  }

  const results = await new AxeBuilder({ page }).analyze()
  const scrollViolations = results.violations.filter(violation => violation.id === 'scrollable-region-focusable')
  expect(scrollViolations).toEqual([])
})
