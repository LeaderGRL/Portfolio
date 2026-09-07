import { test, expect } from '@playwright/test'

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

  const reader = page.locator('#article-reader')
  const media = page.locator('.document-inline-integrations button').first()
  await expect.poll(async () => {
    if (await media.count()) return true
    await reader.evaluate(element => {
      element.scrollTop = Math.min(element.scrollHeight, element.scrollTop + element.clientHeight * 0.8)
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    return false
  }).toBe(true)
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

test('landscape navigation owns its hit area and keeps physical press feedback', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Landscape hit-testing regression only needs Chromium')
  await bootLandscape(page, '/')

  const articles = page.getByRole('button', { name: 'ARTICLES', exact: true })
  const centreIsOwned = await articles.evaluate(key => {
    const rect = key.getBoundingClientRect()
    const owner = document.elementFromPoint(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5)
    return owner === key || key.contains(owner)
  })
  expect(centreIsOwned).toBe(true)

  const box = await articles.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await expect(articles).toHaveClass(/is-down/)
  await page.mouse.up()
  await expect(page).toHaveURL(/\/articles$/)
  await expect(articles).not.toHaveClass(/is-down/)
})
