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

  // Read every region in one browser round-trip. The ECS article intentionally
  // contains many code samples, so issuing two Playwright assertions per block
  // can spend the whole test timeout waiting on protocol/actionability work.
  const regionSemantics = await codeRegions.evaluateAll(regions => regions.map(region => ({
    tabIndex: region.getAttribute('tabindex'),
    ariaLabel: region.getAttribute('aria-label')?.trim() || '',
  })))

  expect(regionSemantics.length).toBeGreaterThan(0)
  for (const semantics of regionSemantics) {
    expect(semantics.tabIndex).toBe('0')
    expect(semantics.ariaLabel).not.toBe('')
  }

  const results = await new AxeBuilder({ page }).analyze()
  const scrollViolations = results.violations.filter(violation => violation.id === 'scrollable-region-focusable')
  expect(scrollViolations).toEqual([])
})
