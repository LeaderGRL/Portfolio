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

for (const [viewport, expectedVariant] of [
  [{ width: 915, height: 412 }, '20x9'], // Pixel 7-class viewport
  [{ width: 844, height: 390 }, '20x9'],
  [{ width: 800, height: 360 }, '20x9'],
  [{ width: 667, height: 375 }, '16x9'],
  [{ width: 600, height: 480 }, '5x4'], // near-square touch viewport
  [{ width: 915, height: 300 }, '21x9'], // extreme browser-chrome case
  [{ width: 1024, height: 576 }, '16x9'], // small landscape tablet
  [{ width: 1280, height: 600 }, '20x9'], // upper landscape activation bound
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
      const powerRocker = rect('#power')
      const navFaces = boxes('#nav-keys .key__button')
      const actionFaces = boxes('#action-keys .key__button')
      const targets = boxes('#nav-keys .key, #action-keys .key')
      const navIcons = boxes('#nav-keys .key__icon')
      const actionIcons = boxes('#action-keys .key__icon')
      const machineElement = document.querySelector('#machine')
      const machineScale = machine.width / machineElement.offsetWidth
      const navLabelFontSize = parseFloat(getComputedStyle(document.querySelector('#nav-keys .key__legend')).fontSize) * machineScale
      const actionLabels = [...document.querySelectorAll('#action-keys .key__legend')]
        .map(node => node.getAttribute('data-landscape-label'))
      const style = getComputedStyle(document.documentElement)
      const moulding = {
        left: machine.left + (parseFloat(style.getPropertyValue('--landscape-mould-l')) || 0) * machine.width,
        top: machine.top + (parseFloat(style.getPropertyValue('--landscape-mould-t')) || 0) * machine.height,
        right: machine.left + (parseFloat(style.getPropertyValue('--landscape-mould-r')) || 0) * machine.width,
        bottom: machine.top + (parseFloat(style.getPropertyValue('--landscape-mould-b')) || 0) * machine.height,
      }
      const screenSurroundRight = machine.left
        + (parseFloat(style.getPropertyValue('--landscape-screen-surround-r')) || 0) * machine.width

      const rowTop = row => Math.min(navFaces[row * 2].top, navFaces[row * 2 + 1].top)
      const rowBottom = row => Math.max(navFaces[row * 2].bottom, navFaces[row * 2 + 1].bottom)
      const navRowGaps = [rowTop(1) - rowBottom(0), rowTop(2) - rowBottom(1)]
      const navLastBottom = rowBottom(2)
      const actionFirstTop = Math.min(...actionFaces.map(box => box.top))
      const actionLastBottom = Math.max(...actionFaces.map(box => box.bottom))
      const controls = rect('.panel--right .controls-row')
      const power = rect('.panel--right .bottom-row')
      const powerRule = getComputedStyle(document.querySelector('.panel--right .bottom-row'), '::before')
      const fit = parseFloat(style.getPropertyValue('--fit')) || 1
      const captionSize = (parseFloat(style.getPropertyValue('--landscape-caption-size')) || 0) * fit
      const powerRuleY = power.top + (parseFloat(powerRule.top) || 0) * fit

      return {
        machine,
        screen,
        moulding,
        screenSurroundRight,
        rail,
        variant: document.querySelector('#machine').dataset.landscapeVariant,
        gapX: parseFloat(style.getPropertyValue('--landscape-gap-x')) || 0,
        gapY: parseFloat(style.getPropertyValue('--landscape-gap-y')) || 0,
        navRowGaps,
        navFirstTop: rowTop(0),
        navLastBottom,
        actionFirstTop,
        actionLastBottom,
        controls,
        power,
        powerRocker,
        powerRuleY,
        powerRuleOpacity: parseFloat(powerRule.opacity) || 0,
        powerLabelTop: power.top - captionSize * 1.35,
        faceHeights: [...navFaces, ...actionFaces].map(box => box.height),
        targetHeights: targets.map(box => box.height),
        navIconSizes: navIcons.map(box => [box.width, box.height]),
        actionIconSizes: actionIcons.map(box => [box.width, box.height]),
        actionLabels,
        navLabelFontSize,
      }
    })

    expect(geometry.variant).toBe(expectedVariant)
    expect(Math.abs(Math.max(0, geometry.machine.left) - geometry.gapX)).toBeLessThan(1)
    expect(Math.abs(Math.max(0, geometry.machine.top) - geometry.gapY)).toBeLessThan(1)
    expect(geometry.moulding.left).toBeGreaterThanOrEqual(4)
    expect(geometry.moulding.top).toBeGreaterThanOrEqual(4)
    expect(geometry.moulding.right).toBeLessThanOrEqual(viewport.width - 4)
    expect(geometry.moulding.bottom).toBeLessThanOrEqual(viewport.height - 4)

    const visibleMachineRight = Math.min(viewport.width, geometry.machine.right)
    const leftMaterialGap = geometry.rail.left - geometry.screenSurroundRight
    const rightMaterialGap = visibleMachineRight - geometry.rail.right
    expect(leftMaterialGap).toBeGreaterThanOrEqual(7.5)
    expect(rightMaterialGap).toBeGreaterThanOrEqual(7.5)
    expect(Math.abs(leftMaterialGap - rightMaterialGap)).toBeLessThan(1.5)
    expect(geometry.rail.width / viewport.width).toBeLessThanOrEqual(0.286)
    expect(geometry.rail.left).toBeGreaterThanOrEqual(Math.max(0, geometry.machine.left) - 0.5)
    expect(geometry.rail.right).toBeLessThanOrEqual(Math.min(viewport.width, geometry.machine.right) + 0.5)

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
    // The visible face gap also includes the inset inside each 44px touch
    // target. Chromium/WebKit land around 17.72px at the shortest authored
    // chassis and Firefox can round to 17.75px, so keep the hierarchy guard at
    // 18px instead of forcing the physical buttons larger to satisfy a
    // sub-pixel test boundary.
    expect(largestNavGap).toBeLessThanOrEqual(18 + 7 * largeRhythm)
    expect(navActionGap).toBeGreaterThan(largestNavGap + 5)
    if (viewport.height <= 320) {
      // The 44px targets own most of a 300px-high viewport. The darker tier
      // separator preserves hierarchy while whitespace compresses.
      expect(actionControlsGap).toBeGreaterThanOrEqual(largestNavGap)
    } else {
      expect(actionControlsGap).toBeGreaterThan(largestNavGap + 7)
    }
    expect(controlsPowerGap).toBeGreaterThanOrEqual(3)
    if (geometry.powerRuleOpacity > 0.5) {
      expect(geometry.powerRuleY).toBeGreaterThan(geometry.controls.bottom + 1)
      expect(geometry.powerRuleY).toBeLessThan(geometry.powerLabelTop - 1)
      expect(geometry.powerRuleY).toBeLessThan(geometry.powerRocker.top - 2)
    }

    expect(geometry.navFirstTop).toBeGreaterThanOrEqual(-1)
    expect(geometry.power.bottom).toBeLessThanOrEqual(viewport.height + 1)

    expect(geometry.actionLabels).toEqual(['ENTER', 'BACK'])
    if (viewport.width === 667 && viewport.height === 375) {
      // Regression guard for the compact 16:9 layout: labels used to jump from
      // 7.25px to 10px immediately above the old 640px breakpoint.
      expect(geometry.navLabelFontSize).toBeLessThanOrEqual(8.25)
    }
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
