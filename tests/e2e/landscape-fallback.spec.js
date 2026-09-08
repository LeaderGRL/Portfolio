import { test, expect } from '@playwright/test'

test.use({ hasTouch: true, deviceScaleFactor: 1 })

async function emulateTouchPhone(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })

    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = query => {
      const result = nativeMatchMedia(query)
      if (query !== '(pointer: coarse)' && query !== '(hover: none)') return result
      return new Proxy(result, {
        get(target, property) {
          if (property === 'matches') return true
          const value = Reflect.get(target, property, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    }
  })
}

async function expectLandscapeFallback(page, viewport) {
  await emulateTouchPhone(page)
  await page.setViewportSize(viewport)
  await page.goto('/')

  const machine = page.locator('#machine')
  await expect(machine).toBeVisible()
  await expect(machine).not.toHaveClass(/is-landscape-mobile/)
  await expect(page.locator('body')).not.toHaveClass(/is-landscape-mobile-stage/)
  await expect(page.locator('.machine__background--landscape')).toBeHidden()
  await expect(page.locator('#tube')).not.toHaveAttribute('data-raster-layout', 'landscape')
}

test('near-square touch viewport falls back instead of overlapping the CRT', async ({ page }) => {
  await expectLandscapeFallback(page, { width: 480, height: 400 })
})

test('very short touch viewport falls back instead of clipping the control stack', async ({ page }) => {
  await expectLandscapeFallback(page, { width: 568, height: 240 })
})
