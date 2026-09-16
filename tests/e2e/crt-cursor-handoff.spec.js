import { test, expect } from '@playwright/test'

test.use({ reducedMotion: 'no-preference' })

async function bootCursorPage(page) {
  await page.addInitScript(() => {
    globalThis.__JG1500_VISUAL_TEST__ = true
  })
  await page.goto('/')
  await expect(page.locator('#tube')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__JG1500_APP__?.cursorController?.aperture))).toBe(true)
}

async function apertureGeometry(page) {
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

    return {
      center: project(aperture.centerX, aperture.centerY),
      outside: offset(-(aperture.magneticZonePx + aperture.hysteresisPx + 12)),
      absorb: offset(-8),
      active: offset(8),
      releaseOutside: offset(-(aperture.magneticZonePx + aperture.hysteresisPx + 8)),
    }
  })
}

test('fine-pointer cursor absorbs through SVG, snaps to GPU and releases back to native', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Cursor handoff is exercised once on desktop Chromium')
  await bootCursorPage(page)

  const aperture = await apertureGeometry(page)
  await page.mouse.move(aperture.outside.x, aperture.outside.y)
  await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)

  await page.mouse.move(aperture.absorb.x, aperture.absorb.y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'ABSORBING')
  await expect(page.locator('.crt-cursor-dom__svg')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/crt-cursor-owned/)

  const tip = await page.locator('.crt-cursor-dom').evaluate(node => ({
    left: Number.parseFloat(node.style.left),
    top: Number.parseFloat(node.style.top),
    pointerEvents: getComputedStyle(node).pointerEvents,
  }))
  expect(Math.abs(tip.left - aperture.absorb.x)).toBeLessThan(0.1)
  expect(Math.abs(tip.top - aperture.absorb.y)).toBeLessThan(0.1)
  expect(tip.pointerEvents).toBe('none')

  await page.mouse.move(aperture.active.x, aperture.active.y)
  await expect.poll(() => page.locator('#tube').getAttribute('data-crt-cursor-state'), { timeout: 1000 }).toBe('CRT_ACTIVE')
  await expect(page.locator('.crt-cursor-dom__svg')).toBeHidden()
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(true)

  await page.mouse.move(aperture.releaseOutside.x, aperture.releaseOutside.y)
  await expect.poll(() => page.locator('#tube').getAttribute('data-crt-cursor-state'), { timeout: 1000 }).toBe('NATIVE_OUTSIDE')
  await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(false)
})

test('SVG absorption never intercepts the real click target', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Cursor hit-testing is exercised once on desktop Chromium')
  await bootCursorPage(page)
  const aperture = await apertureGeometry(page)
  const { x, y } = aperture.absorb

  await page.evaluate(({ x, y }) => {
    const button = document.createElement('button')
    button.id = 'cursor-click-probe'
    button.type = 'button'
    button.textContent = 'probe'
    button.style.cssText = `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;z-index:2147482999;opacity:.01;`
    button.addEventListener('click', () => { button.dataset.clicked = 'true' })
    document.body.append(button)
  }, { x, y })

  await page.mouse.move(x, y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'ABSORBING')
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.locator('#cursor-click-probe')).toHaveAttribute('data-clicked', 'true')
})

test('fullscreen softkeys keep the active cursor visible above the DOM overlay', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Fullscreen cursor overlay ownership is exercised once on desktop Chromium')
  await bootCursorPage(page)

  await page.keyboard.press('f')
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  const aperture = await apertureGeometry(page)

  await page.mouse.move(aperture.active.x, aperture.active.y)
  await expect.poll(() => page.locator('#tube').getAttribute('data-crt-cursor-state'), { timeout: 1000 }).toBe('CRT_ACTIVE')
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'gpu')

  const exitKey = page.locator('.softkeys__key--exit')
  await expect(exitKey).toBeVisible()
  const box = await exitKey.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  await expect.poll(() => page.locator('#tube').getAttribute('data-crt-cursor-owner')).toBe('svg-overlay')
  await expect(page.locator('.crt-cursor-dom__svg')).toBeVisible()
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(false)

  await page.mouse.move(aperture.center.x, aperture.center.y)
  await expect.poll(() => page.locator('#tube').getAttribute('data-crt-cursor-owner')).toBe('gpu')
  await expect(page.locator('.crt-cursor-dom__svg')).toBeHidden()
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(true)
})
