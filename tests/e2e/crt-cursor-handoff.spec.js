import { test, expect } from '@playwright/test'

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
    return {
      right: aperture.visible.left + aperture.visible.width,
      centerY: aperture.centerY,
      zone: aperture.magneticZonePx,
      hysteresis: aperture.hysteresisPx,
    }
  })
}

test('fine-pointer cursor absorbs through SVG, snaps to GPU and releases back to native', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Cursor handoff is exercised once on desktop Chromium')
  await bootCursorPage(page)

  const aperture = await apertureGeometry(page)
  await page.mouse.move(aperture.right + aperture.zone + aperture.hysteresis + 12, aperture.centerY)
  await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)

  await page.mouse.move(aperture.right + 8, aperture.centerY)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'ABSORBING')
  await expect(page.locator('.crt-cursor-dom')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/crt-cursor-owned/)

  const tip = await page.locator('.crt-cursor-dom').evaluate(node => ({
    left: Number.parseFloat(node.style.left),
    top: Number.parseFloat(node.style.top),
    pointerEvents: getComputedStyle(node).pointerEvents,
  }))
  expect(Math.abs(tip.left - (aperture.right + 8))).toBeLessThan(0.1)
  expect(Math.abs(tip.top - aperture.centerY)).toBeLessThan(0.1)
  expect(tip.pointerEvents).toBe('none')

  await page.mouse.move(aperture.right - 8, aperture.centerY)
  await expect.poll(() => page.locator('#tube').getAttribute('data-crt-cursor-state'), { timeout: 1000 }).toBe('CRT_ACTIVE')
  await expect(page.locator('.crt-cursor-dom')).toBeHidden()
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(true)

  await page.mouse.move(aperture.right + aperture.zone + aperture.hysteresis + 8, aperture.centerY)
  await expect.poll(() => page.locator('#tube').getAttribute('data-crt-cursor-state'), { timeout: 1000 }).toBe('NATIVE_OUTSIDE')
  await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)
  expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(false)
})

test('SVG absorption never intercepts the real click target', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Cursor hit-testing is exercised once on desktop Chromium')
  await bootCursorPage(page)
  const aperture = await apertureGeometry(page)
  const x = aperture.right + 8
  const y = aperture.centerY

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
