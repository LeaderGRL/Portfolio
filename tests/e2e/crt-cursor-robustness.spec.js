import { test, expect } from '@playwright/test'

const CURSOR_SETTLE_TIMEOUT_MS = 5000
const DESKTOP_PROJECTS = new Set(['chromium', 'firefox', 'webkit'])

async function bootCursorPage(page) {
  await page.addInitScript(() => {
    globalThis.__JG1500_VISUAL_TEST__ = true
  })
  await page.goto('/')
  await expect(page.locator('#tube')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__JG1500_APP__?.cursorController?.aperture))).toBe(true)
}

async function tubePoints(page) {
  return page.locator('#tube').evaluate(node => {
    const rect = node.getBoundingClientRect()
    return {
      center: { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 },
      safe: { x: rect.left + rect.width * 0.32, y: rect.top + rect.height * 0.5 },
      outside: { x: rect.right + 40, y: rect.top + rect.height * 0.5 },
    }
  })
}

async function activateCursor(page, point) {
  await page.mouse.move(point.x, point.y)
  await expect(page.locator('#tube')).toHaveAttribute(
    'data-crt-cursor-state',
    'CRT_ACTIVE',
    { timeout: CURSOR_SETTLE_TIMEOUT_MS },
  )
}

test.describe('exceptional cursor ownership', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('POWER off restores native ownership synchronously and POWER on waits for fresh pointer input', async ({ page }, testInfo) => {
    test.skip(!DESKTOP_PROJECTS.has(testInfo.project.name), 'Fine-pointer robustness runs on desktop engines')
    await bootCursorPage(page)
    const { safe } = await tubePoints(page)
    await activateCursor(page, safe)

    const poweredOff = await page.evaluate(() => {
      const app = globalThis.__JG1500_APP__
      app.machineController.togglePower()
      return {
        state: app.cursorController.state,
        owned: document.documentElement.classList.contains('crt-cursor-owned'),
        visible: app.crt.getCursorState().visible,
      }
    })
    expect(poweredOff).toEqual({ state: 'NATIVE_OUTSIDE', owned: false, visible: false })

    await page.evaluate(() => globalThis.__JG1500_APP__.machineController.togglePower())
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'NATIVE_OUTSIDE')
    await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)

    await activateCursor(page, { x: safe.x + 1, y: safe.y })
  })

  test('sandboxed iframe uses native external ownership and returns directly to CRT_ACTIVE', async ({ page }, testInfo) => {
    test.skip(!DESKTOP_PROJECTS.has(testInfo.project.name), 'Cross-origin cursor fallback runs on desktop engines')
    await bootCursorPage(page)
    const { center, safe } = await tubePoints(page)
    await activateCursor(page, safe)

    await page.evaluate(({ x, y }) => {
      const iframe = document.createElement('iframe')
      iframe.id = 'cursor-external-probe'
      iframe.setAttribute('sandbox', '')
      iframe.srcdoc = '<!doctype html><style>html,body{margin:0;width:100%;height:100%;cursor:crosshair;background:#111}</style>'
      iframe.style.cssText = `position:fixed;left:${x - 40}px;top:${y - 30}px;width:80px;height:60px;z-index:2147483000;border:0;`
      document.body.append(iframe)
    }, center)

    await page.mouse.move(center.x, center.y)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'NATIVE_EXTERNAL')
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-owner', 'external')
    await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)
    expect(await page.evaluate(() => globalThis.__JG1500_APP__.crt.getCursorState().visible)).toBe(false)

    await page.mouse.move(safe.x, safe.y)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE')
    await expect(page.locator('html')).toHaveClass(/crt-cursor-owned/)
    expect(await page.evaluate(() => globalThis.__JG1500_APP__.cursorController.motion.speedPxPerMs)).toBe(0)
  })

  test('WebGL loss fails safe to native ownership and does not recapture stale pointer state', async ({ page }, testInfo) => {
    test.skip(!DESKTOP_PROJECTS.has(testInfo.project.name), 'Runtime fail-safe runs on desktop engines')
    await bootCursorPage(page)
    const { safe } = await tubePoints(page)
    await activateCursor(page, safe)

    const fallback = await page.evaluate(() => {
      const app = globalThis.__JG1500_APP__
      app.crt.ok = false
      app.cursorController.frame(performance.now())
      return {
        state: app.cursorController.state,
        waiting: app.cursorController.awaitFreshPointer,
        owned: document.documentElement.classList.contains('crt-cursor-owned'),
      }
    })
    expect(fallback).toEqual({ state: 'NATIVE_OUTSIDE', waiting: true, owned: false })
  })
})

test.describe('reduced motion cursor ownership', () => {
  test.use({ reducedMotion: 'reduce' })

  test('switches directly at the aperture without Absorption or Release', async ({ page }, testInfo) => {
    test.skip(!DESKTOP_PROJECTS.has(testInfo.project.name), 'Reduced-motion cursor policy runs on desktop engines')
    await bootCursorPage(page)
    const { center, outside } = await tubePoints(page)

    await page.mouse.move(center.x, center.y)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'CRT_ACTIVE')
    await expect(page.locator('.crt-cursor-dom__svg')).toBeHidden()

    await page.mouse.move(outside.x, outside.y)
    await expect(page.locator('#tube')).toHaveAttribute('data-crt-cursor-state', 'NATIVE_OUTSIDE')
    await expect(page.locator('html')).not.toHaveClass(/crt-cursor-owned/)
  })
})
