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

for (const viewport of [
  { width: 915, height: 412 }, // Pixel 7-class viewport
  { width: 844, height: 390 },
  { width: 800, height: 360 },
  { width: 667, height: 375 },
  { width: 600, height: 480 }, // narrow 3:2 cover-crop case
  { width: 915, height: 300 }, // extreme ultrawide browser-chrome case
  { width: 1024, height: 576 }, // small landscape tablet
  { width: 1280, height: 600 }, // upper landscape activation bound
]) {
  test(`landscape composition matches the approved hierarchy at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await bootLandscape(page, viewport)

    const geometry = await page.evaluate(() => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }
      }
      const boxes = selector => [...document.querySelectorAll(selector)].map(node => {
        const box = node.getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }
      })

      const machine = rect('#machine')
      const screen = rect('#screen')
      const rail = rect('.panel--left')
      const navFaces = boxes('#nav-keys .key__button')
      const actionFaces = boxes('#action-keys .key__button')
      const targets = boxes('#nav-keys .key, #action-keys .key')
      const navIcons = boxes('#nav-keys .key__icon')
      const actionIcons = boxes('#action-keys .key__icon')
      const actionLabels = [...document.querySelectorAll('#action-keys .key__legend')]
        .map(node => node.getAttribute('data-landscape-label'))
      const style = getComputedStyle(document.documentElement)

      const rowTop = row => Math.min(navFaces[row * 2].top, navFaces[row * 2 + 1].top)
      const rowBottom = row => Math.max(navFaces[row * 2].bottom, navFaces[row * 2 + 1].bottom)
      const navRowGaps = [rowTop(1) - rowBottom(0), rowTop(2) - rowBottom(1)]
      const navLastBottom = rowBottom(2)
      const actionFirstTop = Math.min(...actionFaces.map(box => box.top))
      const actionLastBottom = Math.max(...actionFaces.map(box => box.bottom))
      const controls = rect('.panel--right .controls-row')
      const power = rect('.panel--right .bottom-row')

      return {
        machine,
        screen,
        rail,
        gapX: parseFloat(style.getPropertyValue('--landscape-gap-x')) || 0,
        gapY: parseFloat(style.getPropertyValue('--landscape-gap-y')) || 0,
        navRowGaps,
        navFirstTop: rowTop(0),
        navLastBottom,
        actionFirstTop,
        actionLastBottom,
        controls,
        power,
        faceHeights: [...navFaces, ...actionFaces].map(box => box.height),
        targetHeights: targets.map(box => box.height),
        navIconSizes: navIcons.map(box => [box.width, box.height]),
        actionIconSizes: actionIcons.map(box => [box.width, box.height]),
        actionLabels,
      }
    })

    expect(geometry.machine.left).toBeLessThanOrEqual(0.5)
    expect(geometry.machine.top).toBeLessThanOrEqual(0.5)
    expect(geometry.machine.right).toBeGreaterThanOrEqual(viewport.width - 0.5)
    expect(geometry.machine.bottom).toBeGreaterThanOrEqual(viewport.height - 0.5)
    expect(geometry.gapX).toBe(0)
    expect(geometry.gapY).toBe(0)

    expect(geometry.rail.left / viewport.width).toBeGreaterThan(0.64)
    expect(geometry.rail.left / viewport.width).toBeLessThan(0.73)
    expect(geometry.rail.right / viewport.width).toBeGreaterThan(0.92)
    expect(geometry.rail.right / viewport.width).toBeLessThanOrEqual(0.985)
    expect(geometry.rail.left - geometry.screen.right).toBeGreaterThanOrEqual(4)

    for (const height of geometry.targetHeights) expect(height).toBeGreaterThanOrEqual(43.9)
    const largeRhythm = Math.max(0, Math.min(1, (viewport.height - 412) / 188))
    const maximumFaceHeight = 31 + 12 * largeRhythm
    for (const height of geometry.faceHeights) {
      expect(height).toBeGreaterThanOrEqual(23)
      expect(height).toBeLessThanOrEqual(maximumFaceHeight)
    }

    const largestNavGap = Math.max(...geometry.navRowGaps)
    const navActionGap = geometry.actionFirstTop - geometry.navLastBottom
    const actionControlsGap = geometry.controls.top - geometry.actionLastBottom
    const controlsPowerGap = geometry.power.top - geometry.controls.bottom
    expect(largestNavGap).toBeLessThanOrEqual(17 + 7 * largeRhythm)
    expect(navActionGap).toBeGreaterThan(largestNavGap + 5)
    if (viewport.height <= 320) {
      // The 44px targets own most of a 300px-high viewport. The darker tier
      // separator preserves hierarchy while whitespace compresses.
      expect(actionControlsGap).toBeGreaterThanOrEqual(largestNavGap)
    } else {
      expect(actionControlsGap).toBeGreaterThan(largestNavGap + 7)
    }
    expect(controlsPowerGap).toBeGreaterThanOrEqual(3)

    expect(geometry.navFirstTop).toBeGreaterThanOrEqual(-1)
    expect(geometry.power.bottom).toBeLessThanOrEqual(viewport.height + 1)

    expect(geometry.actionLabels).toEqual(['ENTER', 'BACK'])
    expect(geometry.actionIconSizes).toHaveLength(2)
    for (const [width, height] of geometry.actionIconSizes) {
      expect(width).toBeGreaterThanOrEqual(12)
      expect(height).toBeGreaterThanOrEqual(12)
      expect(Math.abs(width - geometry.navIconSizes[0][0])).toBeLessThan(1)
      expect(Math.abs(height - geometry.navIconSizes[0][1])).toBeLessThan(1)
    }

    const screenshot = testInfo.outputPath(`landscape-reference-${viewport.width}x${viewport.height}.png`)
    await page.screenshot({ path: screenshot })
    await testInfo.attach(`landscape-reference-${viewport.width}x${viewport.height}`, {
      path: screenshot,
      contentType: 'image/png',
    })
  })
}
