import { test, expect } from '@playwright/test'

test.use({ reducedMotion: 'no-preference' })

const CURSOR_SETTLE_TIMEOUT_MS = 5000

async function bootCursorPage(page) {
  await page.addInitScript(() => {
    globalThis.__JG1500_VISUAL_TEST__ = true
  })
  await page.goto('/')
  await expect(page.locator('#tube')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__JG1500_APP__?.cursorController?.aperture))).toBe(true)
}

async function requireGpuCursor(page, testInfo) {
  const available = await page.evaluate(() => Boolean(globalThis.__JG1500_APP__?.crt?.ok))
  test.skip(!available, `${testInfo.project.name} runner has no WebGL CRT surface`)
}

async function finalValidationGeometry(page) {
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
    const inwardLength = Math.hypot(
      inwardSample.x - boundary.x,
      inwardSample.y - boundary.y,
    ) || 1
    const inward = {
      x: (inwardSample.x - boundary.x) / inwardLength,
      y: (inwardSample.y - boundary.y) / inwardLength,
    }
    const offset = distance => ({
      x: boundary.x + inward.x * distance,
      y: boundary.y + inward.y * distance,
    })

    const samples = [{
      name: 'centre',
      localX: aperture.centerX,
      localY: aperture.centerY,
    }]
    const insetPx = Math.max(10, aperture.snapDepthPx + 6)
    for (const [name, theta] of [
      ['right', 0],
      ['bottom-right', Math.PI * 0.25],
      ['bottom', Math.PI * 0.5],
      ['bottom-left', Math.PI * 0.75],
      ['left', Math.PI],
      ['top-left', Math.PI * 1.25],
      ['top', Math.PI * 1.5],
      ['top-right', Math.PI * 1.75],
    ]) {
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      const boundaryX = aperture.centerX
        + aperture.halfWidth * Math.sign(cos || 1) * Math.pow(Math.abs(cos), 2 / aperture.exponent)
      const boundaryY = aperture.centerY
        + aperture.halfHeight * Math.sign(sin || 1) * Math.pow(Math.abs(sin), 2 / aperture.exponent)
      const dx = aperture.centerX - boundaryX
      const dy = aperture.centerY - boundaryY
      const length = Math.hypot(dx, dy) || 1
      samples.push({
        name,
        localX: boundaryX + dx / length * insetPx,
        localY: boundaryY + dy / length * insetPx,
      })
    }

    return {
      capture: offset(-8),
      hysteresisInside: [-18, -13, -19, -12].map(offset),
      reversal: offset(-(aperture.magneticZonePx + aperture.hysteresisPx + 7)),
      samples: samples.map(sample => ({
        name: sample.name,
        point: project(sample.localX, sample.localY),
        hotspotUv: {
          x: sample.localX / projection.localWidth,
          y: 1 - sample.localY / projection.localHeight,
        },
      })),
    }
  })
}

async function activateAt(page, point) {
  await page.mouse.move(point.x, point.y)
  await expect(page.locator('#tube')).toHaveAttribute(
    'data-crt-cursor-state',
    'CRT_ACTIVE',
    { timeout: CURSOR_SETTLE_TIMEOUT_MS },
  )
}

test('native chassis ownership survives capture reversal and rapid hysteresis oscillation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Final fine-pointer validation runs once on desktop Chromium')
  await bootCursorPage(page)
  await requireGpuCursor(page, testInfo)

  const power = await page.locator('#power').boundingBox()
  expect(power).not.toBeNull()
  await page.mouse.move(power.x + power.width * 0.5, power.y + power.height * 0.5)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'NATIVE_OUTSIDE')
  await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)

  const geometry = await finalValidationGeometry(page)
  await page.mouse.move(geometry.capture.x, geometry.capture.y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'ABSORBING')
  await expect(page.locator('html')).toHaveClass(/crt-cursor-owned/)

  for (const point of geometry.hysteresisInside) {
    await page.mouse.move(point.x, point.y)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'ABSORBING')
    expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(false)
  }

  await page.mouse.move(geometry.reversal.x, geometry.reversal.y)
  await expect(page.locator('#tube')).toHaveAttribute(
    'data-crt-cursor-state',
    'NATIVE_OUTSIDE',
    { timeout: CURSOR_SETTLE_TIMEOUT_MS },
  )
  await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)
  await expect(page.locator('.crt-cursor-dom__svg')).toBeHidden()
})

test('GPU hotspot remains aligned at centre, straight edges and all curved corners', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Projected hotspot validation runs once on desktop Chromium')
  await bootCursorPage(page)
  await requireGpuCursor(page, testInfo)

  const geometry = await finalValidationGeometry(page)
  await activateAt(page, geometry.samples[0].point)

  for (const sample of geometry.samples) {
    await page.mouse.move(sample.point.x, sample.point.y)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE')
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'gpu')

    const gpu = await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState())
    expect(gpu.visible, `${sample.name} GPU cursor should be visible`).toBe(true)
    expect(Math.abs(gpu.hotspotUv.x - sample.hotspotUv.x), `${sample.name} x hotspot`).toBeLessThan(0.002)
    expect(Math.abs(gpu.hotspotUv.y - sample.hotspotUv.y), `${sample.name} y hotspot`).toBeLessThan(0.002)
    await expect(page.locator('.crt-cursor-dom__svg')).toBeHidden()
  }
})

test('CRT optics switch keeps electronic ownership while bypassing the GPU cursor', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'CRT bypass validation runs once on desktop Chromium')
  await bootCursorPage(page)
  await requireGpuCursor(page, testInfo)

  const geometry = await finalValidationGeometry(page)
  await activateAt(page, geometry.samples[0].point)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'gpu')

  expect(await page.evaluate(() => globalThis.__JG1500_APP__.machineController.toggleCrt())).toBe(false)
  await expect(page.locator('#tube')).toHaveClass(/is-crt-off/)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE')
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'svg')
  await expect(page.locator('html')).toHaveClass(/crt-cursor-owned/)
  await expect(page.locator('.crt-cursor-dom__svg')).toBeVisible()
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(false)

  expect(await page.evaluate(() => globalThis.__JG1500_APP__.machineController.toggleCrt())).toBe(true)
  await expect(page.locator('#tube')).not.toHaveClass(/is-crt-off/)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'gpu')
  await expect(page.locator('.crt-cursor-dom__svg')).toBeHidden()
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(true)
})
