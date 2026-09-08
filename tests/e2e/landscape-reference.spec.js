import { test, expect } from '@playwright/test'

test.use({ hasTouch: true, deviceScaleFactor: 1 })

async function bootLandscape(page, viewport) {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Test: native fullscreen unavailable'))
    Element.prototype.webkitRequestFullscreen = undefined
  })
  await page.goto('/')
  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)
}

for (const viewport of [{ width: 915, height: 412 }, { width: 844, height: 390 }]) {
  test(`landscape chassis is full bleed and airy at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await bootLandscape(page, viewport)

    const geometry = await page.evaluate(() => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }
      }
      const machine = rect('#machine')
      const navFaces = [...document.querySelectorAll('#nav-keys .key__button')].map(node => node.getBoundingClientRect())
      const actionFaces = [...document.querySelectorAll('#action-keys .key__button')].map(node => node.getBoundingClientRect())
      const targets = [...document.querySelectorAll('#nav-keys .key, #action-keys .key')].map(node => node.getBoundingClientRect())
      const style = getComputedStyle(document.documentElement)

      return {
        machine,
        gapX: parseFloat(style.getPropertyValue('--landscape-gap-x')) || 0,
        gapY: parseFloat(style.getPropertyValue('--landscape-gap-y')) || 0,
        navLastBottom: Math.max(...navFaces.map(box => box.bottom)),
        actionFirstTop: Math.min(...actionFaces.map(box => box.top)),
        actionLastBottom: Math.max(...actionFaces.map(box => box.bottom)),
        controls: rect('.panel--right .controls-row'),
        power: rect('.panel--right .bottom-row'),
        faceHeights: [...navFaces, ...actionFaces].map(box => box.height),
        targetHeights: targets.map(box => box.height),
      }
    })

    expect(geometry.machine.left).toBeLessThanOrEqual(0.5)
    expect(geometry.machine.top).toBeLessThanOrEqual(0.5)
    expect(geometry.machine.right).toBeGreaterThanOrEqual(viewport.width - 0.5)
    expect(geometry.machine.bottom).toBeGreaterThanOrEqual(viewport.height - 0.5)
    expect(geometry.gapX).toBe(0)
    expect(geometry.gapY).toBe(0)

    for (const height of geometry.targetHeights) expect(height).toBeGreaterThanOrEqual(43.9)
    for (const height of geometry.faceHeights) {
      expect(height).toBeGreaterThan(20)
      expect(height).toBeLessThan(34)
    }

    expect(geometry.actionFirstTop - geometry.navLastBottom).toBeGreaterThan(18)
    expect(geometry.controls.top - geometry.actionLastBottom).toBeGreaterThan(18)
    expect(geometry.power.top - geometry.controls.bottom).toBeGreaterThan(18)
    expect(geometry.power.bottom).toBeLessThanOrEqual(viewport.height + 1)

    const screenshot = testInfo.outputPath(`landscape-reference-${viewport.width}x${viewport.height}.png`)
    await page.screenshot({ path: screenshot })
    await testInfo.attach(`landscape-reference-${viewport.width}x${viewport.height}`, {
      path: screenshot,
      contentType: 'image/png',
    })
  })
}
