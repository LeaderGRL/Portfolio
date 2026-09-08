import { test, expect } from '@playwright/test'

// Exercise real coarse-pointer CSS as well as the geometry code on every
// engine. The normal suite separately exercises native fullscreen entry.
test.use({ hasTouch: true, deviceScaleFactor: 1 })

async function boot(page, viewport, route = '/') {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => {
    // Desktop Firefox/WebKit emulate touch events and coarse-pointer CSS but
    // retain the host's zero maxTouchPoints. Model a phone consistently.
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Test: native fullscreen unavailable'))
    Element.prototype.webkitRequestFullscreen = undefined
  })
  await page.goto(route)
  await expect(page.locator('#nav-keys .key.is-on')).toHaveAttribute('aria-label', (route.split('/')[1] || 'home').toUpperCase())
  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)
}

async function expectViewportGlass(page) {
  const geometry = await page.evaluate(() => {
    const tube = document.getElementById('tube')
    const rect = tube.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, vw: innerWidth, vh: innerHeight }
  })
  expect(geometry.x).toBeCloseTo(0, 0)
  expect(geometry.y).toBeCloseTo(0, 0)
  expect(geometry.width).toBeCloseTo(geometry.vw, 0)
  expect(geometry.height).toBeCloseTo(geometry.vh, 0)
  const keys = await page.locator('.softkeys__key').evaluateAll(elements => elements.map(key => {
    const rect = key.getBoundingClientRect()
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return { visible: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1, hit: target === key || key.contains(target), height: rect.height }
  }))
  for (const key of keys) {
    expect(key.visible).toBe(true)
    expect(key.hit).toBe(true)
    expect(key.height).toBeGreaterThanOrEqual(44)
  }
  const reserved = await page.locator('#tube').evaluate(tube => ({
    bottom: parseFloat(getComputedStyle(tube).getPropertyValue('--fullscreen-bottom')),
    controls: document.getElementById('softkeys').offsetHeight,
  }))
  expect(reserved.bottom).toBeGreaterThanOrEqual(reserved.controls + 12)
}

for (const viewport of [{ width: 915, height: 412 }, { width: 844, height: 390 }, { width: 568, height: 280 }]) {
  test(`landscape fullscreen fills ${viewport.width}x${viewport.height} and all controls remain reachable`, async ({ page }, testInfo) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await boot(page, viewport)
    const physicalKeys = await page.locator('#nav-keys .key, #action-keys .key').evaluateAll(keys => keys.map(key => {
      const rect = key.getBoundingClientRect()
      const owner = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      const face = key.querySelector('.key__face').getBoundingClientRect()
      const text = document.createRange()
      text.selectNodeContents(key.querySelector('.key__legend'))
      const label = text.getBoundingClientRect()
      const icon = key.querySelector('.key__icon')?.getBoundingClientRect()
      return {
        x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, height: rect.height,
        hit: owner === key || key.contains(owner),
        labelFits: label.right <= face.right && label.left >= (icon?.right || face.left),
      }
    }))
    for (const [index, key] of physicalKeys.entries()) {
      expect(key.hit).toBe(true)
      expect(key.labelFits).toBe(true)
      expect(key.height).toBeGreaterThanOrEqual(43.9)
      expect(key.bottom).toBeLessThanOrEqual(viewport.height)
      for (const other of physicalKeys.slice(index + 1)) {
        expect(key.x < other.right && key.right > other.x && key.y < other.bottom && key.bottom > other.y).toBe(false)
      }
    }
    await page.locator('#fullscreen-switch').tap()
    await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
    await expect(page.getByRole('button', { name: 'Exit full screen', exact: true })).toBeFocused()
    await expectViewportGlass(page)
    await page.locator('.softkeys__key[data-route="projects"]').tap()
    await expect(page).toHaveURL(/\/projects$/)
    const path = testInfo.outputPath('landscape-fullscreen.png')
    await page.screenshot({ path })
    await testInfo.attach('landscape-fullscreen', { path, contentType: 'image/png' })
    await page.getByRole('button', { name: 'Exit full screen', exact: true }).tap()
    await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)
    await expect(page.locator('#fullscreen-switch')).toBeFocused()
    await expect(page.locator('#fullscreen-switch')).toHaveAttribute('aria-checked', 'false')
    expect(errors).toEqual([])
  })
}

test('fullscreen safe-area controls and reading position survive both rotations', async ({ page }) => {
  await boot(page, { width: 915, height: 412 }, '/articles/01-ecs-entity-management')
  const reader = page.locator('#article-reader')
  await expect(reader).toBeVisible()
  await reader.evaluate(element => { element.scrollTop = (element.scrollHeight - element.clientHeight) * .4 })
  const progress = () => reader.evaluate(element => element.scrollTop / (element.scrollHeight - element.clientHeight))
  await expect.poll(progress).toBeCloseTo(.4, 1)
  await page.evaluate(() => {
    for (const [edge, value] of Object.entries({ left: 44, right: 44, bottom: 21 })) {
      document.documentElement.style.setProperty(`--safe-area-${edge}`, `${value}px`)
    }
  })
  await page.locator('#fullscreen-switch').tap()
  await expectViewportGlass(page)
  const keyEdges = await page.locator('.softkeys__key').evaluateAll(keys => keys.map(key => {
    const r = key.getBoundingClientRect()
    return r.left >= 44 && r.right <= innerWidth - 44 && r.bottom <= innerHeight - 21
  }))
  expect(keyEdges.every(Boolean)).toBe(true)
  await expect.poll(progress).toBeCloseTo(.4, 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectViewportGlass(page)
  await expect.poll(progress).toBeCloseTo(.4, 1)
  await page.setViewportSize({ width: 844, height: 390 })
  await expectViewportGlass(page)
  await expect.poll(progress).toBeCloseTo(.4, 1)
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).tap()
  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)
  await expect.poll(progress).toBeCloseTo(.4, 1)
})
