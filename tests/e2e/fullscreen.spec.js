import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'
const isMobile = testInfo => testInfo.project.name === 'mobile-chromium'

// Native fullscreen can use the runner's virtual monitor rather than the
// requested viewport. Leave time for software-GL captures on hosted runners.
test.describe.configure({ timeout: 60_000 })

async function attachScreenshot(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function boot(page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toBeVisible()
  // Visible glass can still be showing the firmware boot sequence. Wait for
  // navigation restoration before sending keys to the requested route.
  const section = (path.split('/')[1] || 'home').toUpperCase()
  await expect(page.locator('#nav-keys .key.is-on')).toHaveAttribute('aria-label', section)
}

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

async function expectViewportSource(page, selector) {
  // All tested viewports are below the texture/pixel caps. WebKit on Windows
  // can report the host's 2x density even with a 1x desktop context; native
  // fullscreen may also resize Firefox to its virtual screen dimensions.
  await expect.poll(() => page.locator(selector).evaluate(canvas => {
    const density = Math.min(devicePixelRatio, 2)
    return [canvas.width - Math.floor(innerWidth * density), canvas.height - Math.floor(innerHeight * density)]
  })).toEqual([0, 0])
}

// A 16:9 viewport that stays light for software-GL runners: the full-screen
// shader covers the whole viewport, so its cost scales with this size. The
// cross-browser lifecycle scenarios use this size to bound software-GL cost.
// The mobile device profile also multiplies the canvas by its pixel density.
const DESKTOP = { width: 960, height: 540 }

test('full screen fills the viewport with a high-resolution continuous glass surface', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'Portrait geometry is covered by the mobile scenario')
  await page.setViewportSize(DESKTOP)
  await boot(page)

  const fullscreenSwitch = page.locator('#fullscreen-switch')
  await expect(fullscreenSwitch).toHaveAttribute('aria-checked', 'false')
  await fullscreenSwitch.click()

  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  await expect(fullscreenSwitch).toHaveAttribute('aria-checked', 'true')

  // The whole viewport is glass; the chassis is set aside.
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  const tube = await page.locator('#tube').boundingBox()
  expect(tube).not.toBeNull()
  expect(Math.round(tube.x)).toBe(0)
  expect(Math.round(tube.y)).toBe(0)
  expect(Math.round(tube.width)).toBe(viewport.width)
  expect(Math.round(tube.height)).toBe(viewport.height)
  await expect(page.locator('.panel--left')).toBeHidden()
  await expect(page.locator('.panel--right')).toBeHidden()

  // Both the picture and its interaction layers fill the viewport. The cell
  // grid remains proportional within that surface, not a 4:3 backing canvas.
  const surface = await page.locator('.display-surface').boundingBox()
  expect(surface).not.toBeNull()
  expect(Math.round(surface.height)).toBe(viewport.height)
  expect(Math.round(surface.width)).toBe(viewport.width)
  expect(Math.round(surface.x)).toBe(0)
  await expectViewportSource(page, '#fallback2d')
  await expect(page.locator('.tube__shade')).toBeVisible()
  await expect(page.locator('.tube__gloss--soft')).toBeHidden()
  await expect(page.locator('.tube__gloss--core')).toBeHidden()
  await expect(page.locator('.fullscreen-reflection')).toHaveCount(0)

  // Navigation stays available on the glass.
  const softkeys = page.locator('#softkeys')
  await expect(softkeys).toBeVisible()
  await expect(softkeys.locator('[aria-current="page"]')).toHaveText(/HOME/)
  await attachScreenshot(page, testInfo, 'full-screen-desktop')
  await softkeys.locator('[data-route="about"]').click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(softkeys.locator('[aria-current="page"]')).toHaveText(/ABOUT/)

  await softkeys.locator('.softkeys__key--exit').click()
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
  await expect(fullscreenSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.panel--left')).toBeVisible()
  expect(await page.locator('#fallback2d').evaluate(canvas => [canvas.width, canvas.height])).toEqual([480, 360])
  await expect(page.locator('.fullscreen-reflection')).toHaveCount(0)
  await expect(page.locator('.tube__gloss--core')).toBeVisible()
})

test('escape leaves full screen before it means BACK', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'Desktop keyboard scenario')
  await page.setViewportSize(DESKTOP)
  await boot(page, '/articles/01-ecs-entity-management')

  await page.keyboard.press('f')
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)

  await page.keyboard.press('Escape')
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
  await expect(page).toHaveURL(/\/articles\/01-ecs-entity-management$/)

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/articles$/)
})

test('full screen switch sits on its own tier on the portable panel', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'Portable geometry regression only needs the mobile engine')
  test.setTimeout(120_000) // Full-viewport software GL plus a high-DPR screenshot on hosted runners.
  await boot(page)

  const boxes = {}
  for (const id of ['crt-switch', 'fullscreen-switch', 'volume', 'power']) {
    boxes[id] = await page.locator(`#${id}`).boundingBox()
    expect(boxes[id], id).not.toBeNull()
  }
  const viewport = page.viewportSize()
  for (const [id, box] of Object.entries(boxes)) {
    expect(box.x, `${id} inside viewport`).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, `${id} inside viewport`).toBeLessThanOrEqual(viewport.width)
  }
  expect(overlaps(boxes['crt-switch'], boxes['fullscreen-switch'])).toBe(false)
  expect(overlaps(boxes['fullscreen-switch'], boxes['volume'])).toBe(false)
  expect(overlaps(boxes['fullscreen-switch'], boxes['power'])).toBe(false)
  expect(boxes['power'].y).toBeGreaterThan(boxes['fullscreen-switch'].y + boxes['fullscreen-switch'].height)

  await page.locator('#fullscreen-switch').tap()
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  // A portrait screen uses its height too; no short landscape picture window.
  const surface = await page.locator('.display-surface').boundingBox()
  expect(Math.round(surface.width)).toBe(viewport.width)
  expect(Math.round(surface.height)).toBe(viewport.height)
  await expect(page.locator('#softkeys')).toBeVisible()
  await expect(page.locator('.tube__gloss--core')).toBeHidden()
  await expect(page.locator('.tube__shade')).toBeVisible()
  await attachScreenshot(page, testInfo, 'full-screen-portable')
  await page.locator('.softkeys__key--exit').tap()
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
  await expect(page.locator('.tube__gloss--core')).toBeVisible()
})

test('full screen mode is axe-clean', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Accessibility regression only needs one browser engine')
  await page.setViewportSize(DESKTOP)
  await boot(page)
  await page.keyboard.press('f')
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)

  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
  expect(serious).toEqual([])
})

test('keyboard focus survives full screen entry, navigation and exit', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'Desktop keyboard scenario')
  await page.setViewportSize(DESKTOP)
  await boot(page)
  const toggle = page.locator('#fullscreen-switch')
  await toggle.focus()
  await page.keyboard.press('Space')
  const exit = page.locator('.softkeys__key--exit')
  await expect(exit).toBeFocused()
  const projects = page.locator('#softkeys [data-route="projects"]')
  await projects.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/projects$/)
  await expect(projects).toBeFocused()
  await page.keyboard.press('f')
  await expect(page.locator('body')).not.toHaveClass(/is-crt-fullscreen/)
  await expect(toggle).toBeFocused()
  await expect(page).toHaveURL(/\/projects$/)
})

for (const mode of ['crt-off', 'no-webgl']) {
  test(`article fullscreen preserves scroll and geometry with ${mode}`, async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'Fallback scenario is covered on desktop browser engines')
    await page.setViewportSize(DESKTOP)
    await page.addInitScript(({ noWebGL }) => {
      // Exercise the CSS-only mode used when native fullscreen is unavailable.
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('Test: native fullscreen unavailable'))
      if (noWebGL) {
        const original = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          return type === 'webgl2' ? null : original.call(this, type, ...args)
        }
      }
    }, { noWebGL: mode === 'no-webgl' })
    await boot(page, '/articles/01-ecs-entity-management')
    const reader = page.locator('#article-reader')
    await expect(reader).toBeVisible()
    await reader.evaluate(node => { node.scrollTop = 700 })
    const progress = await reader.evaluate(node => node.scrollTop / (node.scrollHeight - node.clientHeight))
    if (mode === 'crt-off') await page.locator('#crt-switch').click()
    await page.locator('#fullscreen-switch').click()
    await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
    await expect(page.locator('#tube')).toHaveClass(mode === 'crt-off' ? /is-crt-off/ : /is-fallback/)
    // Same raster position, allowing at most one native scroll pixel of rounding.
    const drift = () => reader.evaluate((node, progress) => Math.abs(node.scrollTop - progress * (node.scrollHeight - node.clientHeight)), progress)
    await expect.poll(drift).toBeLessThanOrEqual(1)
    const surface = await page.locator('#display-surface').boundingBox()
    const pixels = await page.locator('#article-source').boundingBox()
    for (const dimension of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(surface[dimension] - pixels[dimension])).toBeLessThan(1)
    }
    await expectViewportSource(page, '#article-source')
    if (mode === 'crt-off') {
      await expect(page.locator('.tube__shade')).toBeHidden()
      await expect(page.locator('.tube__gloss--core')).toBeHidden()
      await expect(page.locator('.tube__gloss--soft')).toBeHidden()
    }
    await attachScreenshot(page, testInfo, `article-fullscreen-${mode}`)
    await page.locator('.softkeys__key--exit').click()
    await expect.poll(drift).toBeLessThanOrEqual(1)
    await expect(page).toHaveURL(/\/articles\/01-ecs-entity-management$/)
  })
}

test('fullscreen article and media retain high-resolution CRT without specular glare', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo) && !isMobile(testInfo), 'Resolution and touch geometry use Chromium profiles')
  // Two full-resolution captures, media inspection and reflow are expensive
  // under software GL. Keep 1080p coverage without relaxing UI assertions.
  test.setTimeout(120_000)
  if (isChromiumDesktop(testInfo)) await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(() => {
    // Chromium disallows setWindowBounds while natively fullscreen. Keep the
    // CSS fullscreen layout active to exercise live resizing/orientation here;
    // the preceding scenarios cover native entry and exit separately.
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Test: CSS fullscreen resize'))
  })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await boot(page, '/articles/02-ecs-rust-data-oriented-design')
  await page.locator('#fullscreen-switch').click()
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')

  const dimensions = await page.locator('#article-source').evaluate(canvas => ({
    width: canvas.width, height: canvas.height,
    viewportWidth: innerWidth, viewportHeight: innerHeight,
    dpr: Math.min(devicePixelRatio, 2),
  }))
  expect(dimensions.width).toBe(Math.round(dimensions.viewportWidth * dimensions.dpr))
  expect(dimensions.height).toBe(Math.round(dimensions.viewportHeight * dimensions.dpr))
  expect(dimensions.width).toBeGreaterThan(480)
  await expect(page.locator('.tube__gloss--core')).toBeHidden()
  await expect(page.locator('.tube__shade')).toBeVisible()
  await attachScreenshot(page, testInfo, 'fullscreen-classic-article')

  // The first illustration is above the fold at these sizes. Its real DOM
  // hit target must agree with the reflowed raster and open the same pipeline.
  const media = page.locator('.document-inline-integrations button').first()
  await expect(media).toBeVisible()
  const target = await media.boundingBox()
  expect(target.x).toBeGreaterThanOrEqual(0)
  expect(target.x + target.width).toBeLessThanOrEqual(dimensions.viewportWidth + 1)
  await media.click()
  await expect(page.locator('#tube')).toHaveClass(/is-media-inspecting/)
  const inspected = await page.locator('#article-source').evaluate(canvas => ({ width: canvas.width, height: canvas.height }))
  expect(inspected).toEqual({ width: dimensions.width, height: dimensions.height })
  await expect(page.locator('.tube__gloss--core')).toBeHidden()
  await attachScreenshot(page, testInfo, 'fullscreen-classic-media')
  await page.keyboard.press('Escape')
  await expect(page.locator('#tube')).not.toHaveClass(/is-media-inspecting/)
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)

  // Reflow after orientation/window changes must keep hotspots and rendering
  // alive; returning to the chassis restores the native 480x360 source.
  const progress = await page.locator('#article-reader').evaluate(node => node.scrollTop)
  await page.setViewportSize(isMobile(testInfo) ? { width: 851, height: 393 } : { width: 960, height: 720 })
  await expect(media).toBeVisible()
  expect(await page.locator('#article-reader').evaluate(node => node.scrollTop)).toBe(progress)
  await page.locator('.softkeys__key--exit').click()
  expect(await page.locator('#article-source').evaluate(canvas => [canvas.width, canvas.height])).toEqual([480, 360])
  expect(errors).toEqual([])
})

test('fullscreen navigation, CRT bypass and power keep their state across routes', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  if (!isMobile(testInfo)) await page.setViewportSize(DESKTOP)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await boot(page)
  await page.locator('#fullscreen-switch').click()
  const tube = page.locator('#tube')
  const gloss = page.locator('.tube__gloss--core')
  const shade = page.locator('.tube__shade')
  for (const route of ['about', 'resume', 'projects', 'articles', 'contact', 'home']) {
    await page.locator(`#softkeys [data-route="${route}"]`).click()
    await expect(page.locator('#softkeys [aria-current="page"]')).toHaveAttribute('data-route', route)
    await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
    await expect(gloss).toBeHidden()
  }
  await page.keyboard.press('c')
  await expect(tube).toHaveClass(/is-crt-off/)
  await expect(shade).toBeHidden()
  await expect(page.locator('#fallback2d')).toBeVisible()
  await page.keyboard.press('p')
  await expect(tube).toHaveClass(/is-powered-off/)
  await expect(page.locator('#fallback2d')).toBeHidden()
  await page.keyboard.press('p')
  await expect(tube).not.toHaveClass(/is-powered-off/)
  await expect(page.locator('#fallback2d')).toBeVisible()
  await page.keyboard.press('c')
  await expect(tube).not.toHaveClass(/is-crt-off/)
  await expect(shade).toBeVisible()
  await expect(gloss).toBeHidden()
  await page.locator('.softkeys__key--exit').click()
  await expect(gloss).toBeVisible()
  await expect(shade).toBeVisible()
  expect(errors).toEqual([])
})
