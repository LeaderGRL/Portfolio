import { test, expect } from '@playwright/test'

test.use({ hasTouch: true, deviceScaleFactor: 1 })

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

async function terminalSignature(page) {
  return page.locator('#fallback2d').evaluate(canvas => {
    const context = canvas.getContext('2d')
    const x = Math.round(canvas.width * 0.08)
    const y = Math.round(canvas.height * 0.09)
    const width = Math.round(canvas.width * 0.84)
    const height = Math.round(canvas.height * 0.55)
    const pixels = context.getImageData(x, y, width, height).data
    let hash = 2166136261
    for (let index = 0; index < pixels.length; index += 4) {
      hash ^= pixels[index]
      hash = Math.imul(hash, 16777619)
      hash ^= pixels[index + 1]
      hash = Math.imul(hash, 16777619)
      hash ^= pixels[index + 2]
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  })
}

async function swipeTerminalUp(page) {
  const tube = page.locator('#tube')
  const box = await tube.boundingBox()
  expect(box).not.toBeNull()

  const x = box.x + box.width * 0.5
  const startY = box.y + box.height * 0.72
  const endY = box.y + box.height * 0.28

  await tube.evaluate((node, points) => {
    const fire = (type, y) => node.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 41,
      pointerType: 'touch',
      button: 0,
      clientX: points.x,
      clientY: y,
    }))
    fire('pointerdown', points.startY)
    for (let step = 1; step <= 5; step++) {
      fire('pointermove', points.startY + (points.endY - points.startY) * (step / 5))
    }
    fire('pointerup', points.endY)
  }, { x, startY, endY })
}

for (const route of ['/about', '/resume']) {
  for (const viewport of VIEWPORTS) {
    test(`${route} scrolls by touch on ${viewport.name} mobile`, async ({ page }) => {
      await boot(page, route, viewport)

      const initial = await terminalSignature(page)
      await page.keyboard.press('PageDown')
      await expect.poll(() => terminalSignature(page)).not.toBe(initial)

      await page.keyboard.press('PageUp')
      await expect.poll(() => terminalSignature(page)).toBe(initial)

      await swipeTerminalUp(page)
      await expect.poll(() => terminalSignature(page)).not.toBe(initial)
      await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/')}/?$`))
    })
  }
}
