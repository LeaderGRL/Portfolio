import { test, expect } from '@playwright/test'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'

async function emulateTouchPhone(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })
  })
}

async function bootLandscape(page, path) {
  await emulateTouchPhone(page)
  await page.setViewportSize({ width: 915, height: 412 })
  await page.goto(path)
  await expect(page.locator('#machine')).toHaveClass(/is-landscape-mobile/)
  await expect(page.locator('#tube')).toHaveAttribute('data-raster-layout', 'landscape')
}

test('landscape listing ignores taps in phosphor outside the contained terminal', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Touch hit-testing regression only needs Chromium')
  await bootLandscape(page, '/projects')

  const point = await page.locator('#tube').evaluate(tube => {
    const box = tube.getBoundingClientRect()
    const style = getComputedStyle(tube)
    const localX = parseFloat(style.getPropertyValue('--landscape-terminal-x'))
    const localY = parseFloat(style.getPropertyValue('--landscape-terminal-y'))
    const localW = parseFloat(style.getPropertyValue('--landscape-terminal-w'))
    const localH = parseFloat(style.getPropertyValue('--landscape-terminal-h'))
    const sx = box.width / Math.max(1, tube.offsetWidth)
    const sy = box.height / Math.max(1, tube.offsetHeight)
    const raster = {
      left: box.left + localX * sx,
      top: box.top + localY * sy,
      width: localW * sx,
      height: localH * sy,
    }
    return {
      x: Math.max(box.left + 2, raster.left - Math.max(4, (raster.left - box.left) * 0.5)),
      y: raster.top + raster.height * (81 / 360),
      rasterLeft: raster.left,
    }
  })

  expect(point.x).toBeLessThan(point.rasterLeft)
  await page.mouse.click(point.x, point.y)
  await expect(page).toHaveURL(/\/projects$/)
})

test('CRT-off landscape media canvas matches the wide tube aspect', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Landscape media regression only needs Chromium')
  await bootLandscape(page, '/articles/02-ecs-rust-data-oriented-design')

  await page.locator('#crt-switch').click()
  await expect(page.locator('#tube')).toHaveClass(/is-crt-off/)

  const media = page.locator('.document-inline-integrations button').first()
  await expect(media).toBeVisible()
  await media.click()
  await expect(page.locator('#tube')).toHaveClass(/is-media-inspecting/)

  const ratios = await page.evaluate(() => {
    const tube = document.getElementById('tube')
    const canvas = document.getElementById('media-inspect-hires')
    const rect = tube.getBoundingClientRect()
    return {
      tube: rect.width / rect.height,
      canvas: canvas.width / canvas.height,
    }
  })

  expect(Math.abs(ratios.canvas - ratios.tube)).toBeLessThan(0.01)
})
