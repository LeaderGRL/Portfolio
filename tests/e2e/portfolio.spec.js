import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const projectsKey = page => page.getByRole('button', { name: 'PROJECTS' })
const articlesKey = page => page.getByRole('button', { name: 'ARTICLES' })
const isMobileProject = testInfo => testInfo.project.name.includes('mobile')
const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'

async function boot(page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toBeVisible()
  await page.waitForTimeout(700)
}

async function compactGeometry(page) {
  return page.evaluate(() => {
    const machine = document.getElementById('machine').getBoundingClientRect()
    const rootStyle = getComputedStyle(document.documentElement)
    const bodyBefore = getComputedStyle(document.body, '::before')
    const bodyAfter = getComputedStyle(document.body, '::after')
    const stage = document.getElementById('stage')
    const stageBefore = getComputedStyle(stage, '::before')
    const stageAfter = getComputedStyle(stage, '::after')
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      machine,
      gapX: Number.parseFloat(rootStyle.getPropertyValue('--compact-gap-x')) || 0,
      gapY: Number.parseFloat(rootStyle.getPropertyValue('--compact-gap-y')) || 0,
      fillTop: rootStyle.getPropertyValue('--compact-fill-top'),
      fillBottom: rootStyle.getPropertyValue('--compact-fill-bottom'),
      fillLeft: rootStyle.getPropertyValue('--compact-fill-left'),
      fillRight: rootStyle.getPropertyValue('--compact-fill-right'),
      topApplied: bodyBefore.backgroundImage,
      bottomApplied: bodyAfter.backgroundImage,
      leftApplied: stageBefore.backgroundImage,
      rightApplied: stageAfter.backgroundImage,
    }
  })
}

function isEmbeddedWebp(value) {
  return /url\(["']?data:image\/webp/i.test(String(value || ''))
}

function expectContainedCompactGeometry(dimensions) {
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1)
  expect(dimensions.machine.left).toBeGreaterThanOrEqual(-1)
  expect(dimensions.machine.right).toBeLessThanOrEqual(dimensions.innerWidth + 1)
  expect(dimensions.machine.top).toBeGreaterThanOrEqual(-1)
  expect(dimensions.machine.bottom).toBeLessThanOrEqual(dimensions.innerHeight + 1)

  expect(isEmbeddedWebp(dimensions.fillTop)).toBe(true)
  expect(isEmbeddedWebp(dimensions.fillBottom)).toBe(true)
  expect(isEmbeddedWebp(dimensions.fillLeft)).toBe(true)
  expect(isEmbeddedWebp(dimensions.fillRight)).toBe(true)

  if (dimensions.gapY > 1) {
    expect(isEmbeddedWebp(dimensions.topApplied)).toBe(true)
    expect(isEmbeddedWebp(dimensions.bottomApplied)).toBe(true)
  }
  if (dimensions.gapX > 1) {
    expect(isEmbeddedWebp(dimensions.leftApplied)).toBe(true)
    expect(isEmbeddedWebp(dimensions.rightApplied)).toBe(true)
  }
}

test('panel navigation keeps terminal arrows active after clicking PROJECTS', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Hardware-keyboard scenario is covered by desktop browser engines')
  await boot(page)
  await projectsKey(page).click()
  await expect(page).toHaveURL(/\/projects$/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/projects\/.+/)
})

test('ARTICLES supports keyboard selection and browser history', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Hardware-keyboard scenario is covered by desktop browser engines')
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

test('volume retains its own keyboard boundary', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Hardware-keyboard scenario is covered by desktop browser engines')
  await boot(page, '/projects')
  const slider = page.locator('#volume')
  await slider.focus()
  const before = Number(await slider.getAttribute('aria-valuenow'))
  await page.keyboard.press('ArrowDown')
  const after = Number(await slider.getAttribute('aria-valuenow'))
  expect(after).toBeLessThan(before)
  await expect(page).toHaveURL(/\/projects$/)
})

test('mobile can open a project directly by tapping a CRT listing row', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Touch-only interaction scenario')
  test.setTimeout(60_000)

  await boot(page)
  await projectsKey(page).tap()
  await expect(page).toHaveURL(/\/projects$/)

  const tube = await page.locator('#tube').boundingBox()
  if (!tube) throw new Error('CRT tube has no touchable bounding box')

  const sourceY = 32 + 3 * 14 + 7
  await page.touchscreen.tap(tube.x + tube.width * 0.5, tube.y + tube.height * (sourceY / 360))

  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await expect(page.locator('.article-reader')).toBeAttached()
  await expect(page).toHaveURL(/\/projects\/.+/)
})

test('deep project links render without uncaught page errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await boot(page, '/projects/penw')
  await expect(page).toHaveURL(/\/projects\/penw$/)
  await expect(page.locator('.article-reader')).toBeAttached()
  expect(errors).toEqual([])
})

test('mobile compact geometry is contained over photographed chassis material', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only layout assertion')
  await boot(page)
  await expect(page.locator('#machine')).toHaveClass(/is-compact/)
  expectContainedCompactGeometry(await compactGeometry(page))
})

test('tablet compact geometry is contained over photographed chassis material', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Tablet geometry only needs one browser engine')
  await page.setViewportSize({ width: 768, height: 1024 })
  await boot(page)
  await expect(page.locator('#machine')).toHaveClass(/is-compact/)
  expectContainedCompactGeometry(await compactGeometry(page))
})

test('semantic article focus has a visible CRT proxy', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'One real browser engine is sufficient for focus projection geometry')
  await boot(page, '/projects/penw')

  const source = page.locator('.article-reader a[href]').first()
  await expect(source).toBeAttached()
  await source.focus()

  const proxy = page.locator('.semantic-focus-proxy')
  await expect(proxy).toBeVisible()
  const box = await proxy.boundingBox()
  expect(box?.width || 0).toBeGreaterThanOrEqual(24)
  expect(box?.height || 0).toBeGreaterThanOrEqual(24)
})

test('generic imported article image alternatives are contextualized', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Semantic content only needs one engine for this assertion')
  await boot(page, '/articles/01-ecs-entity-management')
  const alts = await page.locator('.article-reader img').evaluateAll(images => images.map(image => image.getAttribute('alt') || ''))
  expect(alts.length).toBeGreaterThan(0)
  expect(alts.some(alt => /^article illustration$/i.test(alt.trim()))).toBe(false)
})

test('serious accessibility violations are absent across representative routes', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Axe DOM rules are engine-independent; keep CI time bounded')
  test.setTimeout(90_000)

  const routes = [
    '/',
    '/about',
    '/resume',
    '/projects',
    '/articles',
    '/contact',
    '/projects/penw',
    '/articles/01-ecs-entity-management',
  ]

  for (const route of routes) {
    await boot(page, route)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    expect(serious, `${route}\n${serious.map(v => `${v.id}: ${v.help}`).join('\n')}`).toEqual([])
  }
})
