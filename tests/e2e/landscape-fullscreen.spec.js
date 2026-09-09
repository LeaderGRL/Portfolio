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

async function expectLandscapeTiersSeparated(page, viewport, expectedVariant) {
  const geometry = await page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector)
      const box = node.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }
    }
    return {
      variant: document.getElementById('machine')?.dataset.landscapeVariant,
      nav: rect('#nav-keys'),
      actions: rect('#action-keys'),
      controls: rect('.panel--right .controls-row'),
      power: rect('.panel--right .bottom-row'),
    }
  })

  expect(geometry.variant).toBe(expectedVariant)
  expect(geometry.nav.bottom).toBeLessThanOrEqual(geometry.actions.top)
  expect(geometry.actions.bottom).toBeLessThanOrEqual(geometry.controls.top)
  expect(geometry.controls.bottom).toBeLessThanOrEqual(geometry.power.top)
  expect(geometry.power.bottom).toBeLessThanOrEqual(viewport.height + 1)
}

for (const viewport of [
  { width: 915, height: 412 },
  { width: 844, height: 390 },
  { width: 800, height: 360 },
  { width: 667, height: 375 },
  { width: 600, height: 480 },
  { width: 915, height: 300 },
  { width: 1024, height: 576 },
  { width: 1280, height: 600 },
  { width: 568, height: 280 },
]) {
  test(`landscape fullscreen fills ${viewport.width}x${viewport.height} and all controls remain reachable`, async ({ page }, testInfo) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await boot(page, viewport)
    const physicalKeys = await page.locator('#nav-keys .key, #action-keys .key').evaluateAll(keys => keys.map(key => {
      const rect = key.getBoundingClientRect()
      const owner = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      const face = key.querySelector('.key__face').getBoundingClientRect()
      const label = key.querySelector('.key__legend')
      const icon = key.querySelector('.key__icon')?.getBoundingClientRect()
      const labelStyle = getComputedStyle(label)
      const labelStart = label.getBoundingClientRect().left + parseFloat(labelStyle.paddingLeft)
      return {
        x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, height: rect.height,
        hit: owner === key || key.contains(owner),
        label: label.textContent,
        labelWidth: label.clientWidth,
        labelScrollWidth: label.scrollWidth,
        labelStart,
        iconRight: icon?.right || face.left,
        labelFits: label.scrollWidth <= label.clientWidth + 1 && labelStart >= (icon?.right || face.left) - 1,
      }
    }))
    for (const [index, key] of physicalKeys.entries()) {
      expect(key.hit).toBe(true)
      expect(key.labelFits, `${key.label} must fit: scroll ${key.labelScrollWidth}/${key.labelWidth}, start ${key.labelStart}, icon right ${key.iconRight}`).toBe(true)
      const aspect = viewport.width / viewport.height
      const panorama = Math.max(0, Math.min(1, (aspect - 21 / 9) / (3 - 21 / 9)))
      expect(key.height).toBeGreaterThanOrEqual(43.9 - 6 * panorama)
      expect(key.bottom).toBeLessThanOrEqual(viewport.height)
      for (const other of physicalKeys.slice(index + 1)) {
        const overlaps = key.x < other.right && key.right > other.x && key.y < other.bottom && key.bottom > other.y
        expect(
          overlaps,
          `${key.label} ${JSON.stringify(key)} overlaps ${other.label} ${JSON.stringify(other)}`,
        ).toBe(false)
      }
    }
    await page.locator('#fullscreen-switch').tap()
    await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
    await expect(page.getByRole('button', { name: 'Exit full screen', exact: true })).toBeFocused()
    await expectViewportGlass(page)
    const path = testInfo.outputPath(`landscape-fullscreen-${viewport.width}x${viewport.height}.png`)
    await page.screenshot({ path })
    await testInfo.attach(`landscape-fullscreen-${viewport.width}x${viewport.height}`, { path, contentType: 'image/png' })
    await page.locator('.softkeys__key[data-route="projects"]').tap()
    await expect(page).toHaveURL(/\/projects$/)
    await page.getByRole('button', { name: 'Exit full screen', exact: true }).tap()
    await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)
    await expect(page.locator('#fullscreen-switch')).toBeFocused()
    await expect(page.locator('#fullscreen-switch')).toHaveAttribute('aria-checked', 'false')
    expect(errors).toEqual([])
  })
}

for (const [viewport, variant] of [
  [{ width: 600, height: 280 }, '20x9'],
  [{ width: 640, height: 280 }, '21x9'],
]) {
  test(`short landscape keeps all hardware tiers separated at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await boot(page, viewport)
    await expectLandscapeTiersSeparated(page, viewport, variant)

    const physicalKeys = await page.locator('#nav-keys .key, #action-keys .key').evaluateAll(keys => keys.map(key => {
      const rect = key.getBoundingClientRect()
      const owner = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { top: rect.top, bottom: rect.bottom, height: rect.height, hit: owner === key || key.contains(owner) }
    }))
    for (const key of physicalKeys) {
      expect(key.hit).toBe(true)
      expect(key.height).toBeGreaterThanOrEqual(43.9)
      expect(key.top).toBeGreaterThanOrEqual(0)
      expect(key.bottom).toBeLessThanOrEqual(viewport.height + 1)
    }

    const screenshot = testInfo.outputPath(`short-landscape-${viewport.width}x${viewport.height}.png`)
    await page.screenshot({ path: screenshot })
    await testInfo.attach(`short-landscape-${viewport.width}x${viewport.height}`, { path: screenshot, contentType: 'image/png' })
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
