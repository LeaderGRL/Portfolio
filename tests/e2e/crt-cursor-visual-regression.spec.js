import { test, expect } from '@playwright/test'

test.use({
  viewport: { width: 1440, height: 900 },
  screen: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
})

async function bootCursorPage(page) {
  await page.addInitScript(() => {
    globalThis.__JG1500_VISUAL_TEST__ = true
  })
  await page.goto('/')
  await expect(page.locator('#tube')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__JG1500_APP__?.cursorController?.aperture))).toBe(true)
  await page.evaluate(() => document.fonts?.ready)
}

async function requireGpuCursor(page) {
  return page.evaluate(() => Boolean(globalThis.__JG1500_APP__?.crt?.ok))
}

async function visualGeometry(page) {
  return page.evaluate(() => {
    const controller = globalThis.__JG1500_APP__.cursorController
    controller.refreshGeometry()
    const aperture = controller.aperture
    const projection = controller.tubeProjection

    const project = (localX, localY) => {
      const u = localX / projection.localWidth
      const v = localY / projection.localHeight
      const matrix = projection.forwardHomography
      if (!matrix) {
        return {
          x: projection.rect.left + u * projection.rect.width,
          y: projection.rect.top + v * projection.rect.height,
        }
      }
      const denominator = matrix[6] * u + matrix[7] * v + matrix[8]
      return {
        x: (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator,
        y: (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator,
      }
    }

    const right = aperture.visible.left + aperture.visible.width
    const boundary = project(right, aperture.centerY)
    const inwardSample = project(right - 1, aperture.centerY)
    const inwardLength = Math.hypot(inwardSample.x - boundary.x, inwardSample.y - boundary.y) || 1
    const inward = {
      x: (inwardSample.x - boundary.x) / inwardLength,
      y: (inwardSample.y - boundary.y) / inwardLength,
    }
    const offset = distance => ({
      x: boundary.x + inward.x * distance,
      y: boundary.y + inward.y * distance,
    })

    const theta = Math.PI * 0.25
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const cornerX = aperture.centerX + aperture.halfWidth * Math.pow(cos, 2 / aperture.exponent)
    const cornerY = aperture.centerY + aperture.halfHeight * Math.pow(sin, 2 / aperture.exponent)
    const dx = aperture.centerX - cornerX
    const dy = aperture.centerY - cornerY
    const length = Math.hypot(dx, dy) || 1

    return {
      outside: offset(-(aperture.magneticZonePx + aperture.hysteresisPx + 10)),
      absorb: offset(-8),
      preSnap: offset(1),
      center: project(aperture.centerX, aperture.centerY),
      boundary: project(cornerX + dx / length * 10, cornerY + dy / length * 10),
    }
  })
}

async function activate(page, point) {
  await page.mouse.move(point.x, point.y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE')
}

async function freeze(page) {
  await page.evaluate(() => {
    const controller = globalThis.__JG1500_APP__.cursorController
    controller.frame = () => {}
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function captureVisual(page, name) {
  const tube = await page.locator('#tube').boundingBox()
  expect(tube).not.toBeNull()
  const margin = 42
  const clip = {
    x: Math.max(0, tube.x - margin),
    y: Math.max(0, tube.y - margin),
    width: Math.min(1440 - Math.max(0, tube.x - margin), tube.width + margin * 2),
    height: Math.min(900 - Math.max(0, tube.y - margin), tube.height + margin * 2),
  }
  await expect(page).toHaveScreenshot(`crt-cursor-${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    clip,
    maxDiffPixelRatio: 0.008,
    threshold: 0.22,
  })
}

async function prepareAbsorption(page, progress, pointName) {
  const points = await visualGeometry(page)
  await page.mouse.move(points.outside.x, points.outside.y)
  await page.mouse.move(points[pointName].x, points[pointName].y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'ABSORBING')
  await page.evaluate(value => {
    const controller = globalThis.__JG1500_APP__.cursorController
    controller.absorption.progress = value
    controller.absorption.reversing = false
    controller._updateDomCursor(value, 'absorb')
    controller._absorb()
  }, progress)
  await freeze(page)
}

async function bootActive(page, pointName = 'center') {
  const points = await visualGeometry(page)
  await activate(page, points[pointName])
  return points
}

for (const visualCase of [
  ['mid-absorption', async page => prepareAbsorption(page, 0.52, 'absorb')],
  ['pre-snap', async page => prepareAbsorption(page, 0.94, 'preSnap')],
  ['active-centre', async page => {
    await bootActive(page)
    await freeze(page)
  }],
  ['active-curved-boundary', async page => {
    await bootActive(page)
    const points = await visualGeometry(page)
    await page.mouse.move(points.boundary.x, points.boundary.y)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'gpu')
    await freeze(page)
  }],
  ['glass-recoil', async page => {
    await bootActive(page)
    await page.evaluate(() => {
      const controller = globalThis.__JG1500_APP__.cursorController
      const now = performance.now()
      controller._startRecoil(now - 72)
      controller._recoil(now)
      controller._renderActiveRepresentation(0.08, 0.45)
    })
    await freeze(page)
  }],
  ['interactive-lock', async page => {
    await bootActive(page)
    await page.evaluate(() => {
      globalThis.__JG1500_APP__.crt.setCursorState({
        compression: 0.055,
        hoverIntensity: 0.48,
      })
    })
    await freeze(page)
  }],
  ['click-impulse', async page => {
    await bootActive(page)
    await page.evaluate(() => {
      const app = globalThis.__JG1500_APP__
      const controller = app.cursorController
      app.crt.setCursorState({
        compression: 0.13,
        hoverIntensity: 0.48,
        clickImpulse: 0.52,
      })
      controller._applyReaction(controller._placement(), {
        strength: 0.14,
        submergedStrength: 0.08,
        recoilStrength: 0.04,
      }, 'interaction')
    })
    await freeze(page)
  }],
  ['release', async page => {
    await bootActive(page)
    await page.evaluate(() => {
      const controller = globalThis.__JG1500_APP__.cursorController
      const now = performance.now()
      controller._startRelease(now)
      controller.release.startedAtMs = now - 60
      controller._frameRelease(now)
      controller._release(now)
    })
    await freeze(page)
  }],
  ['crt-off-active', async page => {
    await bootActive(page)
    await page.evaluate(() => {
      const app = globalThis.__JG1500_APP__
      app.machineController.toggleCrt()
      app.cursorController._renderActiveRepresentation(0, 0)
    })
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'svg')
    await freeze(page)
  }],
  ['reduced-motion-active', async page => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const points = await visualGeometry(page)
    await page.mouse.move(points.center.x, points.center.y)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE')
    await freeze(page)
  }],
]) {
  test(`${visualCase[0]} matches the approved deterministic cursor baseline`, async ({ page }) => {
    await bootCursorPage(page)
    test.skip(!(await requireGpuCursor(page)), 'Visual runner has no WebGL CRT surface')
    await visualCase[1](page)
    await captureVisual(page, visualCase[0])
  })
}
