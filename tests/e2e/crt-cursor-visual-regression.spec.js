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
  await expect.poll(() => page.evaluate(() => {
    const app = globalThis.__JG1500_APP__
    return Boolean(app && app.reveal >= app.revealTarget)
  })).toBe(true)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
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
    const boundaryLocal = {
      x: cornerX + dx / length * 10,
      y: cornerY + dy / length * 10,
    }

    return {
      outside: offset(-(aperture.magneticZonePx + aperture.hysteresisPx + 10)),
      absorb: offset(-8),
      preSnap: offset(1),
      release: offset(-(aperture.magneticZonePx + aperture.hysteresisPx + 2)),
      center: project(aperture.centerX, aperture.centerY),
      boundary: project(boundaryLocal.x, boundaryLocal.y),
      boundaryHotspotUv: {
        x: boundaryLocal.x / projection.localWidth,
        y: 1 - boundaryLocal.y / projection.localHeight,
      },
    }
  })
}

async function activate(page, point) {
  await page.mouse.move(point.x, point.y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE')
}

async function pinVisualGeometry(page, point = null) {
  await page.evaluate(target => {
    const app = globalThis.__JG1500_APP__
    const controller = app.cursorController
    const x = target?.x ?? controller.motion.x
    const y = target?.y ?? controller.motion.y

    // Pin the visual-test chassis to an explicit pointer-derived pose and stop
    // both animation loops before yielding to the browser compositor.
    const px = Math.max(-1, Math.min(1, (x / innerWidth) * 2 - 1))
    const py = Math.max(-1, Math.min(1, (y / innerHeight) * 2 - 1))
    const root = document.documentElement.style
    root.setProperty('--px', px.toFixed(3))
    root.setProperty('--py', py.toFixed(3))
    controller.frame = () => {}
    if (app.tilt) app.tilt.frame = () => {}
    if (app.renderController) app.renderController.frame = () => {}
  }, point)

  // Let style/compositor state catch up before measuring transformed geometry.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  await page.evaluate(target => {
    const controller = globalThis.__JG1500_APP__.cursorController
    const x = target?.x ?? controller.motion.x
    const y = target?.y ?? controller.motion.y

    controller.refreshGeometry()
    controller.handlePointerMove({
      clientX: x,
      clientY: y,
      timeStamp: performance.now(),
      pointerType: controller.pointerType || 'mouse',
      target: document.elementFromPoint(x, y),
    })
  }, point)
}

async function freeze(page) {
  await pinVisualGeometry(page)

  await page.evaluate(() => {
    const app = globalThis.__JG1500_APP__
    const controller = app.cursorController

    if (controller.state === 'CRT_ACTIVE') {
      // Normal active-state baselines must not inherit scheduling-dependent
      // Snap recomposition/recoil. Dedicated cases stage those effects later.
      controller.recompose = null
      controller.recoil = null
      controller.seed = null
      controller._resetReaction?.()
      controller._renderActiveRepresentation(0, 0)
    } else if (controller.state === 'ABSORBING') {
      const progress = controller.absorption?.progress || 0
      controller._updateDomCursor(progress, 'absorb')
      controller._absorb?.()
    }
  })
}

async function waitForGpuHotspot(page, hotspotUv) {
  await expect.poll(() => page.evaluate(expected => {
    const gpu = globalThis.__JG1500_APP__.crt.getCursorState()
    if (!gpu.visible) return Number.POSITIVE_INFINITY
    return Math.max(
      Math.abs(gpu.hotspotUv.x - expected.x),
      Math.abs(gpu.hotspotUv.y - expected.y),
    )
  }, hotspotUv)).toBeLessThan(0.002)
}

async function renderStableCursorFrame(page, { clearPersistence = true, passes = 2 } = {}) {
  await page.evaluate(({ shouldClear, renderPasses }) => {
    const app = globalThis.__JG1500_APP__
    const pipeline = app.displayPipeline
    if (!app.crt?.ok) throw new Error('Stable cursor visual render requires WebGL CRT')

    // Mirror the VISUAL_TEST state pinning normally performed by RenderController,
    // then render a fixed number of passes from a known phosphor history.
    app.state.power = app.state.powerTarget
    app.state.crt = app.state.crtTarget
    app.state.degauss = 0
    app.state.static = 0
    app.state.warm = 1
    app.state.time = 42
    app.dirty = false

    if (shouldClear) {
      if (typeof pipeline?._clearPersistence !== 'function') {
        throw new Error('DisplayPipeline persistence reset unavailable')
      }
      pipeline._clearPersistence()
    }

    for (let index = 0; index < renderPasses; index += 1) {
      app.crt.render(app.state, false)
    }
    app.crt.gl?.finish?.()
  }, { shouldClear: clearPersistence, renderPasses: passes })
}

async function captureCursorCrop(page, point) {
  const width = 64
  const height = 64
  const clip = {
    x: Math.round(Math.max(0, Math.min(1440 - width, point.x - width * 0.5))),
    y: Math.round(Math.max(0, Math.min(900 - height, point.y - height * 0.5))),
    width,
    height,
  }
  return page.screenshot({
    type: 'png',
    scale: 'css',
    animations: 'disabled',
    caret: 'hide',
    clip,
  })
}

async function cursorCropDifference(page, before, after) {
  return page.evaluate(async ({ beforeBase64, afterBase64 }) => {
    const decode = async base64 => {
      const response = await fetch(`data:image/png;base64,${base64}`)
      const bitmap = await createImageBitmap(await response.blob())
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(bitmap, 0, 0)
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
      const result = { width: bitmap.width, height: bitmap.height, pixels }
      bitmap.close()
      return result
    }

    const a = await decode(beforeBase64)
    const b = await decode(afterBase64)
    if (a.width !== b.width || a.height !== b.height) throw new Error('Cursor crops have different dimensions')

    let changedPixels = 0
    let maxDelta = 0
    for (let index = 0; index < a.pixels.length; index += 4) {
      const delta = Math.max(
        Math.abs(a.pixels[index] - b.pixels[index]),
        Math.abs(a.pixels[index + 1] - b.pixels[index + 1]),
        Math.abs(a.pixels[index + 2] - b.pixels[index + 2]),
      )
      maxDelta = Math.max(maxDelta, delta)
      if (delta >= 4) changedPixels += 1
    }
    return { changedPixels, maxDelta }
  }, {
    beforeBase64: before.toString('base64'),
    afterBase64: after.toString('base64'),
  })
}

async function assertFocusedCursorStateChange(page, point, mutate, label) {
  await renderStableCursorFrame(page)
  const before = await captureCursorCrop(page, point)
  await mutate()
  await renderStableCursorFrame(page)
  const after = await captureCursorCrop(page, point)
  const difference = await cursorCropDifference(page, before, after)
  expect(difference.changedPixels, `${label} must change the rendered cursor footprint`).toBeGreaterThan(8)
  expect(difference.maxDelta, `${label} must visibly change cursor emission`).toBeGreaterThanOrEqual(6)
}

async function captureVisual(page, name) {
  await renderStableCursorFrame(page)

  let pointer
  if (name === 'active-curved-boundary' || name === 'release') {
    const points = await visualGeometry(page)
    pointer = name === 'active-curved-boundary' ? points.boundary : points.release
  } else {
    pointer = await page.evaluate(() => {
      const motion = globalThis.__JG1500_APP__.cursorController.motion
      return { x: motion.x, y: motion.y }
    })
  }
  expect(Number.isFinite(pointer.x)).toBe(true)
  expect(Number.isFinite(pointer.y)).toBe(true)

  const width = 280
  const height = 200
  const clip = {
    x: Math.round(Math.max(0, Math.min(1440 - width, pointer.x - width * 0.5))),
    y: Math.round(Math.max(0, Math.min(900 - height, pointer.y - height * 0.5))),
    width,
    height,
  }
  const screenshot = await page.screenshot({
    type: 'jpeg',
    quality: 30,
    animations: 'disabled',
    caret: 'hide',
    clip,
  })
  expect(screenshot).toMatchSnapshot(`crt-cursor-${name}.jpg`, {
    maxDiffPixels: 96,
    threshold: 0.15,
  })
}

async function prepareAbsorption(page, progress, pointName) {
  const points = await visualGeometry(page)
  await page.mouse.move(points.outside.x, points.outside.y)
  await page.mouse.move(points[pointName].x, points[pointName].y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'ABSORBING')
  await freeze(page)
  await page.evaluate(value => {
    const controller = globalThis.__JG1500_APP__.cursorController

    // Absorption visuals must not depend on Playwright event timing. Pin the
    // filtered pointer speed to rest before rendering the injected progress;
    // direction remains the last stable movement angle.
    controller.motion.speedPxPerMs = 0
    controller.motion.speedPendingDistancePx = 0
    controller.motion.speedReferenceX = controller.motion.x
    controller.motion.speedReferenceY = controller.motion.y
    controller.motion.speedReferenceTimeMs = controller.motion.timeMs
    controller.lastFrameMs = controller.motion.timeMs

    controller.absorption.progress = value
    controller.absorption.reversing = false
    controller._updateDomCursor(value, 'absorb')
    controller._absorb()
  }, progress)

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
    await waitForGpuHotspot(page, points.boundaryHotspotUv)
    await freeze(page)
  }],
  ['glass-recoil', async page => {
    await bootActive(page)
    await freeze(page)
    await page.evaluate(() => {
      const controller = globalThis.__JG1500_APP__.cursorController
      const now = performance.now()
      controller._startRecoil(now - 72)
      controller._recoil(now)
      controller._renderActiveRepresentation(0.08, 0.45)
    })
  }],
  ['interactive-lock', async page => {
    const points = await bootActive(page)
    await freeze(page)
    await assertFocusedCursorStateChange(page, points.center, () => page.evaluate(() => {
      globalThis.__JG1500_APP__.crt.setCursorState({
        compression: 0.055,
        hoverIntensity: 0.48,
      })
    }), 'Interactive Lock')
  }],
  ['click-impulse', async page => {
    const points = await bootActive(page)
    await freeze(page)
    // Prove the cursor's own click/compression rendering first, with glass
    // reaction still neutral, so source warping cannot satisfy this assertion.
    await assertFocusedCursorStateChange(page, points.center, () => page.evaluate(() => {
      globalThis.__JG1500_APP__.crt.setCursorState({
        compression: 0.13,
        hoverIntensity: 0.48,
        clickImpulse: 0.52,
      })
    }), 'click impulse')
    // The approved full baseline still includes the coupled local glass pulse.
    await page.evaluate(() => {
      const app = globalThis.__JG1500_APP__
      const controller = app.cursorController
      controller._applyReaction(controller._placement(), {
        strength: 0.14,
        submergedStrength: 0.08,
        recoilStrength: 0.04,
      }, 'interaction')
    })
  }],
  ['release', async page => {
    const points = await bootActive(page)
    await pinVisualGeometry(page, points.release)
    await page.evaluate(() => {
      const app = globalThis.__JG1500_APP__
      const controller = app.cursorController

      if (controller.state !== 'CRT_ACTIVE') throw new Error(`Expected CRT_ACTIVE before Release, got ${controller.state}`)
      controller.recompose = null
      controller.recoil = null
      controller.seed = null
      controller._resetReaction?.()
      controller._renderActiveRepresentation(0, 0)

      const now = performance.now()
      controller._startRelease(now)
      controller.release.startedAtMs = now - 60
      controller._frameRelease(now)
      controller._release(now)
    })
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'RELEASING')
  }],
  ['crt-off-active', async page => {
    await bootActive(page)
    await freeze(page)
    await page.evaluate(() => {
      const app = globalThis.__JG1500_APP__
      app.machineController.toggleCrt()
      app.cursorController._renderActiveRepresentation(0, 0)
    })
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'svg')
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