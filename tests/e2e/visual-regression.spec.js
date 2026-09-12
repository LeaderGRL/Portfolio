import { test, expect } from '@playwright/test'

const cases = [
  {
    name: 'desktop-1440x900',
    viewport: { width: 1440, height: 900 },
    context: { hasTouch: false, isMobile: false },
  },
  {
    name: 'pixel7-portrait-412x915',
    viewport: { width: 412, height: 915 },
    context: { hasTouch: true, isMobile: true },
  },
  {
    name: 'iphone-portrait-393x852',
    viewport: { width: 393, height: 852 },
    context: { hasTouch: true, isMobile: true },
  },
  {
    name: 'tablet-portrait-768x1024',
    viewport: { width: 768, height: 1024 },
    context: { hasTouch: true, isMobile: true },
  },
  {
    name: 'mobile-landscape-915x412',
    viewport: { width: 915, height: 412 },
    context: { hasTouch: true, isMobile: true },
  },
]

async function bootStableHome(page) {
  await page.addInitScript(() => {
    globalThis.__JG1500_VISUAL_TEST__ = true
  })
  await page.goto('/')
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#nav-keys .key.is-on')).toHaveAttribute('aria-label', 'HOME')
  await page.evaluate(() => document.fonts?.ready)
  await expect.poll(() => page.evaluate(() => {
    const app = globalThis.__JG1500_APP__
    if (!app) return null
    return {
      booting: app.booting,
      route: app.state.route,
      degauss: app.state.degauss,
      static: app.state.static,
      clock: app.state.clock,
    }
  })).toEqual({
    booting: false,
    route: 'home',
    degauss: 0,
    static: 0,
    clock: '12:34:56',
  })
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
}

for (const visualCase of cases) {
  test.describe(visualCase.name, () => {
    test.use({
      viewport: visualCase.viewport,
      screen: visualCase.viewport,
      ...visualCase.context,
    })

    test('matches the approved physical composition', async ({ page }) => {
      await bootStableHome(page)
      await expect(page).toHaveScreenshot(`${visualCase.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
        threshold: 0.22,
      })
    })
  })
}
