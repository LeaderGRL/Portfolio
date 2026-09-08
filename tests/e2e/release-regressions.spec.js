import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'

async function emulateTouchPhone(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })

    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = query => {
      const result = nativeMatchMedia(query)
      if (query !== '(pointer: coarse)' && query !== '(hover: none)') return result
      return new Proxy(result, {
        get(target, property) {
          if (property === 'matches') return true
          const value = Reflect.get(target, property, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    }
  })
}

async function boot(page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toBeVisible()
  await page.waitForTimeout(700)
}

async function expectInsideViewport(locator, width, height, tolerance = 1) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box.x).toBeGreaterThanOrEqual(-tolerance)
  expect(box.y).toBeGreaterThanOrEqual(-tolerance)
  expect(box.x + box.width).toBeLessThanOrEqual(width + tolerance)
  expect(box.y + box.height).toBeLessThanOrEqual(height + tolerance)
  return box
}

for (const viewport of [
  { width: 740, height: 480, variant: '3x2' },
  { width: 667, height: 375, variant: '16x9' },
  { width: 915, height: 412, variant: '21x9' },
]) {
  test(`landscape ${viewport.width}x${viewport.height} uses the ${viewport.variant} authored chassis`, async ({ page }, testInfo) => {
    test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
    await emulateTouchPhone(page)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await boot(page)

    const machine = page.locator('#machine')
    await expect(machine).toHaveClass(/is-landscape-mobile/)
    await expect(machine).not.toHaveClass(/is-compact/)
    await expect(machine).toHaveAttribute('data-landscape-variant', viewport.variant)
    await expect(page.locator('body')).toHaveClass(/is-landscape-mobile-stage/)

    const machineBox = await machine.boundingBox()
    expect(machineBox).not.toBeNull()
    expect(machineBox.x).toBeLessThanOrEqual(1)
    expect(machineBox.y).toBeLessThanOrEqual(1)
    expect(machineBox.x + machineBox.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(machineBox.y + machineBox.height).toBeGreaterThanOrEqual(viewport.height - 1)
    await expect(page.locator('.nameplate')).toBeHidden()

    const background = page.locator('.machine__background--landscape img')
    await expect.poll(async () => background.evaluate(image => image.dataset.decodeState)).toBe('ready')
    const decoded = await background.evaluate(image => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    }))
    expect(decoded.width).toBeGreaterThan(0)
    expect(decoded.height).toBeGreaterThan(0)

    const screen = await page.locator('#screen').boundingBox()
    expect(screen).not.toBeNull()
    expect(screen.width).toBeGreaterThan(260)
    expect(screen.height).toBeGreaterThan(160)

    const keys = page.locator('#nav-keys .key, #action-keys .key')
    await expect(keys).toHaveCount(8)
    const keyBoxes = await keys.evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    }))
    for (const box of keyBoxes) {
      expect(box.height).toBeGreaterThanOrEqual(44)
    }

    const navKeysOwnTheirCentres = await page.locator('#nav-keys .key').evaluateAll(keys => keys.map(key => {
      const rect = key.getBoundingClientRect()
      const owner = document.elementFromPoint(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5)
      return owner === key || key.contains(owner)
    }))
    expect(navKeysOwnTheirCentres).toEqual([true, true, true, true, true, true])

    const rasterRect = await page.locator('#tube').evaluate(element => {
      const style = getComputedStyle(element)
      return {
        width: parseFloat(style.getPropertyValue('--landscape-terminal-w')),
        height: parseFloat(style.getPropertyValue('--landscape-terminal-h')),
        tubeWidth: element.clientWidth,
        tubeHeight: element.clientHeight,
      }
    })
    expect(rasterRect.width / rasterRect.height).toBeCloseTo(4 / 3, 2)
    expect(rasterRect.width).toBeGreaterThan(0)
    expect(rasterRect.height).toBeGreaterThan(0)
    expect(rasterRect.width).toBeLessThanOrEqual(rasterRect.tubeWidth + 1)
    expect(rasterRect.height).toBeLessThanOrEqual(rasterRect.tubeHeight + 1)
  })
}

test('short desktop viewport does not activate the touch-only landscape chassis', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Desktop input regression only needs Chromium')
  await page.setViewportSize({ width: 960, height: 540 })
  await boot(page)
  await expect(page.locator('#machine')).not.toHaveClass(/is-landscape-mobile/)
  await expect(page.locator('body')).not.toHaveClass(/is-landscape-mobile-stage/)
})

test('landscape chassis stays full bleed while interactive hardware respects safe-area insets', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
  await emulateTouchPhone(page)
  await page.setViewportSize({ width: 915, height: 412 })
  await boot(page)

  await page.evaluate(() => {
    const root = document.documentElement.style
    root.setProperty('--safe-area-left', '42px')
    root.setProperty('--safe-area-right', '34px')
    root.setProperty('--safe-area-top', '8px')
    root.setProperty('--safe-area-bottom', '6px')
    window.dispatchEvent(new Event('resize'))
  })

  const machine = await page.locator('#machine').boundingBox()
  expect(machine).not.toBeNull()
  expect(machine.x).toBeLessThanOrEqual(1)
  expect(machine.y).toBeLessThanOrEqual(1)
  expect(machine.x + machine.width).toBeGreaterThanOrEqual(914)
  expect(machine.y + machine.height).toBeGreaterThanOrEqual(411)

  const controls = await page.locator('#nav-keys .key, #action-keys .key, #crt-switch, #fullscreen-switch, #volume, #power').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
  }))
  for (const box of controls) {
    expect(box.left).toBeGreaterThanOrEqual(42 - 1)
    expect(box.right).toBeLessThanOrEqual(915 - 34 + 1)
    expect(box.top).toBeGreaterThanOrEqual(8 - 1)
    expect(box.bottom).toBeLessThanOrEqual(412 - 6 + 1)
  }
})

test('rotating a phone returns from landscape chassis to portrait compact chassis', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
  await emulateTouchPhone(page)
  await page.setViewportSize({ width: 915, height: 412 })
  await boot(page)
  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)

  await page.setViewportSize({ width: 412, height: 915 })
  await expect(page.locator('#machine')).toHaveClass(/is-compact/)
  await expect(page.locator('#machine')).not.toHaveClass(/is-landscape-mobile/)
  await expect(page.locator('body')).not.toHaveClass(/is-landscape-mobile-stage/)
})

test('entering fullscreen removes landscape chassis geometry', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
  await emulateTouchPhone(page)
  await page.setViewportSize({ width: 915, height: 412 })
  await boot(page)
  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)

  await page.evaluate(() => document.getElementById('fullscreen-switch')?.click())
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  await expect(page.locator('#machine')).not.toHaveClass(/is-landscape-mobile/)
  await expect(page.locator('body')).not.toHaveClass(/is-landscape-mobile-stage/)
  await expect(page.locator('#tube')).not.toHaveAttribute('data-raster-layout', 'landscape')
})

test('landscape article enlarges the visible raster and keeps document scrolling', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Geometry regression only needs one browser engine')
  await emulateTouchPhone(page)
  await page.setViewportSize({ width: 915, height: 412 })
  await boot(page, '/articles/01-ecs-entity-management')

  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)
  const reader = page.locator('#article-reader')
  await expect(reader).toBeVisible()

  const geometry = await reader.evaluate(element => ({
    overflowY: getComputedStyle(element).overflowY,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  expect(['auto', 'scroll']).toContain(geometry.overflowY)
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight)

  const rasterScale = await page.locator('#tube').evaluate(element => ({
    mode: element.dataset.rasterLayout,
    physicalScale: parseFloat(getComputedStyle(element).getPropertyValue('--landscape-document-scale')),
  }))
  expect(rasterScale.mode).toBe('landscape')
  expect(rasterScale.physicalScale).toBeGreaterThanOrEqual(1.08)
  expect(rasterScale.physicalScale).toBeLessThanOrEqual(1.25)
  expect(10 * rasterScale.physicalScale).toBeGreaterThanOrEqual(10.8)

  const before = await reader.evaluate(element => element.scrollTop)
  await reader.evaluate(element => { element.scrollTop += Math.max(80, element.clientHeight * 0.5) })
  const after = await reader.evaluate(element => element.scrollTop)
  expect(after).toBeGreaterThan(before)
})

test('article code stays in the visible CRT document flow and is axe-clean', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Accessibility regression only needs one browser engine')
  await boot(page, '/articles/01-ecs-entity-management')

  const codeRegions = page.locator('.article-reader__code')
  await expect(codeRegions.first()).toBeAttached()

  const geometry = await codeRegions.evaluateAll(regions => regions.map(region => ({
    tabIndex: region.getAttribute('tabindex'),
    overflowX: getComputedStyle(region).overflowX,
    overflowY: getComputedStyle(region).overflowY,
    scrollWidth: region.scrollWidth,
    clientWidth: region.clientWidth,
  })))

  expect(geometry.length).toBeGreaterThan(0)
  for (const region of geometry) {
    expect(region.tabIndex).toBeNull()
    expect(region.overflowX).not.toBe('auto')
    expect(region.overflowX).not.toBe('scroll')
    expect(region.overflowY).not.toBe('auto')
    expect(region.overflowY).not.toBe('scroll')
    expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth + 1)
  }

  const results = await new AxeBuilder({ page }).analyze()
  const scrollViolations = results.violations.filter(violation => violation.id === 'scrollable-region-focusable')
  expect(scrollViolations).toEqual([])
})
