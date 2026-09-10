import { test, expect } from '@playwright/test'

test.use({ hasTouch: true, deviceScaleFactor: 1 })

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'Terminal touch scrolling is a mobile-device regression test.',
  )
})

const VIEWPORTS = [
  { name: 'portrait', width: 412, height: 915 },
  { name: 'landscape', width: 915, height: 412 },
]

async function boot(page, route, viewport) {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })
  })
  await page.goto(route)
  await expect(page.locator('#nav-keys .key.is-on')).toHaveAttribute('aria-label', route.slice(1).toUpperCase())
}

async function terminalScroll(page) {
  return page.locator('#tube').evaluate(node => Number(node.dataset.terminalScroll))
}

async function swipeTerminalUp(page) {
  const tube = page.locator('#tube')
  const box = await tube.boundingBox()
  expect(box).not.toBeNull()

  const x = box.x + box.width * 0.5
  const startY = box.y + box.height * 0.72
  const endY = box.y + box.height * 0.28
  const cdp = await page.context().newCDPSession(page)

  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: startY }],
    })
    for (let step = 1; step <= 5; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: startY + (endY - startY) * (step / 5) }],
      })
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
  } finally {
    await cdp.detach()
  }
}

for (const route of ['/about', '/resume']) {
  for (const viewport of VIEWPORTS) {
    test(`${route} scrolls by touch on ${viewport.name} mobile`, async ({ page }) => {
      await boot(page, route, viewport)

      await expect.poll(() => terminalScroll(page)).toBe(0)
      await page.keyboard.press('PageDown')
      await expect.poll(() => terminalScroll(page)).toBeGreaterThan(0)

      await page.keyboard.press('PageUp')
      await expect.poll(() => terminalScroll(page)).toBe(0)

      await swipeTerminalUp(page)
      await expect.poll(() => terminalScroll(page)).toBeGreaterThan(0)
      await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/')}/?$`))
    })
  }
}
