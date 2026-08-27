import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const projectsKey = page => page.getByRole('button', { name: 'PROJECTS' })
const articlesKey = page => page.getByRole('button', { name: 'ARTICLES' })

async function boot(page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toBeVisible()
  await page.waitForTimeout(700)
}

test('panel navigation keeps terminal arrows active after clicking PROJECTS', async ({ page }) => {
  await boot(page)
  await projectsKey(page).click()
  await expect(page).toHaveURL(/\/projects$/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/projects\/.+/)
})

test('ARTICLES supports keyboard selection and browser history', async ({ page }) => {
  await boot(page)
  await articlesKey(page).click()
  await expect(page).toHaveURL(/\/articles$/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/articles\/.+/)
  const detailUrl = page.url()
  await page.goBack()
  await expect(page).toHaveURL(/\/articles$/)
  await page.goForward()
  await expect(page).toHaveURL(detailUrl)
})

test('volume retains its own keyboard boundary', async ({ page }) => {
  await boot(page, '/projects')
  const slider = page.locator('#volume')
  await slider.focus()
  const before = Number(await slider.getAttribute('aria-valuenow'))
  await page.keyboard.press('ArrowDown')
  const after = Number(await slider.getAttribute('aria-valuenow'))
  expect(after).toBeLessThan(before)
  await expect(page).toHaveURL(/\/projects$/)
})

test('deep project links render without uncaught page errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await boot(page, '/projects/penw')
  await expect(page).toHaveURL(/\/projects\/penw$/)
  await expect(page.locator('.article-reader')).toBeAttached()
  expect(errors).toEqual([])
})

test('compact viewport uses the mobile chassis without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile-only layout assertion')
  await boot(page)
  await expect(page.locator('#machine')).toHaveClass(/is-compact/)
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1)
})

test('critical accessibility violations are absent on core routes', async ({ page }) => {
  await boot(page, '/contact')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast'])
    .analyze()
  const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
  expect(critical, critical.map(v => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})
