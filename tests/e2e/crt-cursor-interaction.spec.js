import { test, expect } from '@playwright/test'

test.use({ reducedMotion: 'no-preference' })

async function bootCursorPage(page) {
  await page.addInitScript(() => { globalThis.__JG1500_VISUAL_TEST__ = true })
  await page.goto('/')
  await expect(page.locator('#tube')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__JG1500_APP__?.cursorController?.aperture))).toBe(true)
}

async function activePoint(page) {
  return page.evaluate(() => {
    const controller = globalThis.__JG1500_APP__.cursorController
    controller.refreshGeometry()
    const { aperture, tubeProjection: p } = controller
    const project = (x, y) => {
      const u = x / p.localWidth
      const v = y / p.localHeight
      const m = p.forwardHomography
      if (!m) return { x: p.rect.left + u * p.rect.width, y: p.rect.top + v * p.rect.height }
      const d = m[6] * u + m[7] * v + m[8]
      return { x: (m[0] * u + m[1] * v + m[2]) / d, y: (m[3] * u + m[4] * v + m[5]) / d }
    }
    return project(aperture.centerX, aperture.centerY)
  })
}

test('Interactive Lock preserves hotspot and only genuine activations fire feedback', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Interactive cursor feedback is exercised once on desktop Chromium')
  await bootCursorPage(page)
  const point = await activePoint(page)

  await page.evaluate(({ x, y }) => {
    const button = document.createElement('button')
    button.id = 'cursor-action-probe'
    button.type = 'button'
    button.textContent = 'probe'
    button.style.cssText = `position:fixed;left:${x - 28}px;top:${y - 28}px;width:56px;height:56px;z-index:2147482999;opacity:.01;`
    button.addEventListener('click', () => { button.dataset.clicks = String((Number(button.dataset.clicks) || 0) + 1) })
    document.body.append(button)
  }, point)

  await page.mouse.move(point.x, point.y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE', { timeout: 5000 })
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-interactive', 'locked')

  const locked = await page.evaluate(() => {
    const app = globalThis.__JG1500_APP__
    return { cursor: app.crt.getCursorState(), x: app.cursorController.motion.x, y: app.cursorController.motion.y }
  })
  expect(locked.cursor.hoverIntensity).toBeGreaterThan(0)

  await page.mouse.click(point.x, point.y)
  await expect(page.locator('#cursor-action-probe')).toHaveAttribute('data-clicks', '1')
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-activation-count', '1')

  await page.locator('#cursor-action-probe').evaluate(node => node.remove())
  await page.mouse.move(point.x + 70, point.y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-interactive', 'idle')
  await page.mouse.click(point.x + 70, point.y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-activation-count', '1')
})

test('content navigation under a stationary owned pointer never replays Absorption', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Cursor ownership continuity is exercised once on desktop Chromium')
  await bootCursorPage(page)
  const point = await activePoint(page)
  await page.mouse.move(point.x, point.y)
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE', { timeout: 5000 })

  const before = await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().hotspotUv)
  await page.evaluate(() => globalThis.__JG1500_APP__.go('projects'))
  await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE')
  const after = await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().hotspotUv)
  expect(Math.abs(after.x - before.x)).toBeLessThan(0.001)
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.001)
})
