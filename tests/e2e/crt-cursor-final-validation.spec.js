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

async function measureRenderedCursorAtHotspot(page, hotspotUv) {
  return page.evaluate(expected => {
    const app = globalThis.__JG1500_APP__
    const crt = app.crt
    const gl = crt.gl
    const savedState = crt.getCursorState()
    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    const centerX = expected.x * width
    const centerY = expected.y * height
    const radius = 7
    const x = Math.max(0, Math.min(width - 1, Math.floor(centerX) - radius))
    const y = Math.max(0, Math.min(height - 1, Math.floor(centerY) - radius))
    const readWidth = Math.min(radius * 2 + 1, width - x)
    const readHeight = Math.min(radius * 2 + 1, height - y)

    const read = () => {
      const pixels = new Uint8Array(readWidth * readHeight * 4)
      gl.finish()
      gl.readPixels(x, y, readWidth, readHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      return pixels
    }

    // Render/read both states synchronously on the same WebGL framebuffer.
    // page.evaluate runs atomically with respect to RAF callbacks, so the
    // controller cannot move the hotspot between the visible/hidden samples.
    crt.render(app.state, false)
    const visible = read()
    crt.setCursorState({ ...savedState, visible: false })
    crt.render(app.state, false)
    const hidden = read()
    crt.setCursorState(savedState)
    crt.render(app.state, false)

    let changedPixels = 0
    let nearestStrongPx = Number.POSITIVE_INFINITY
    let hotspotPeak = 0
    const localHotspotX = centerX - x
    const localHotspotY = centerY - y

    for (let py = 0; py < readHeight; py += 1) {
      for (let px = 0; px < readWidth; px += 1) {
        const index = (py * readWidth + px) * 4
        const delta = Math.max(
          Math.abs(visible[index] - hidden[index]),
          Math.abs(visible[index + 1] - hidden[index + 1]),
          Math.abs(visible[index + 2] - hidden[index + 2]),
        )
        const distance = Math.hypot(
          px + 0.5 - localHotspotX,
          py + 0.5 - localHotspotY,
        )
        if (distance <= 3) hotspotPeak = Math.max(hotspotPeak, delta)
        if (delta >= 18) {
          changedPixels += 1
          nearestStrongPx = Math.min(nearestStrongPx, distance)
        }
      }
    }

    return { changedPixels, nearestStrongPx, hotspotPeak }
  }, hotspotUv)
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
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.cursorController.zoneLatched)).toBe(true)

  for (const point of geometry.hysteresisInside) {
    await page.mouse.move(point.x, point.y)
    expect(await page.evaluate(() => globalThis.__JG1500_APP__.cursorController.zoneLatched)).toBe(true)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'ABSORBING')
    expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(false)
  }

  await page.mouse.move(geometry.reversal.x, geometry.reversal.y)
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.cursorController.zoneLatched)).toBe(false)
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

    await expect.poll(() => page.evaluate(expected => {
      const gpu = globalThis.__JG1500_APP__.crt.getCursorState()
      if (!gpu.visible) return Number.POSITIVE_INFINITY
      return Math.max(
        Math.abs(gpu.hotspotUv.x - expected.x),
        Math.abs(gpu.hotspotUv.y - expected.y),
      )
    }, sample.hotspotUv)).toBeLessThan(0.002)

    const gpu = await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState())
    expect(gpu.visible, `${sample.name} GPU cursor should be visible`).toBe(true)
    expect(Math.abs(gpu.hotspotUv.x - sample.hotspotUv.x), `${sample.name} x hotspot`).toBeLessThan(0.002)
    expect(Math.abs(gpu.hotspotUv.y - sample.hotspotUv.y), `${sample.name} y hotspot`).toBeLessThan(0.002)
    await expect(page.locator('.crt-cursor-dom__svg')).toBeHidden()

    const rendered = await measureRenderedCursorAtHotspot(page, sample.hotspotUv)
    expect(rendered.changedPixels, `${sample.name} should render visible cursor pixels`).toBeGreaterThan(6)
    expect(rendered.hotspotPeak, `${sample.name} should render cursor energy at the browser hotspot`).toBeGreaterThanOrEqual(12)
    expect(rendered.nearestStrongPx, `${sample.name} rendered cursor tip should stay on the browser hotspot`).toBeLessThan(3.25)
  }
})

test('pointer-only frames keep the real RenderController source clean', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'RenderController dirty-path validation runs once on desktop Chromium')
  await bootCursorPage(page)
  await requireGpuCursor(page, testInfo)
  await expect.poll(() => page.evaluate(() => {
    const app = globalThis.__JG1500_APP__
    return Boolean(app && app.reveal >= app.revealTarget && !app.dirty)
  })).toBe(true)

  const geometry = await finalValidationGeometry(page)
  await activateAt(page, geometry.samples[0].point)
  await page.evaluate(() => {
    const app = globalThis.__JG1500_APP__
    const render = app.crt.render.bind(app.crt)
    app.__cursorSourceDirtySamples = []
    app.crt.render = (state, sourceDirty) => {
      app.__cursorSourceDirtySamples.push(Boolean(sourceDirty))
      return render(state, sourceDirty)
    }
  })

  // Exercise many real pointer events across the active CRT while the normal
  // RenderController RAF keeps sampling source dirtiness. Batch the reads so
  // this proof does not spend its timeout on browser round-trips.
  for (const sample of geometry.samples.slice(1)) {
    await page.mouse.move(sample.point.x, sample.point.y, { steps: 4 })
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(
    () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
  )))

  const pointerSamples = await page.evaluate(() => globalThis.__JG1500_APP__.__cursorSourceDirtySamples.slice())
  expect(pointerSamples.length, 'pointer motion should reach crt.render across multiple frames').toBeGreaterThanOrEqual(3)
  expect(pointerSamples.every(value => value === false), 'pointer-only frames must keep the source clean').toBe(true)

  await page.evaluate(() => {
    const app = globalThis.__JG1500_APP__
    app.__cursorSourceDirtySamples.length = 0
    app.renderController.render()
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.__cursorSourceDirtySamples.includes(true))).toBe(true)
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