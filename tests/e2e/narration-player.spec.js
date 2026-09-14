import { test, expect } from '@playwright/test'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'
const isMobileChromium = testInfo => testInfo.project.name === 'mobile-chromium'

async function installNarrationHarness(page) {
  await page.addInitScript(() => {
    window.__JG1500_VISUAL_TEST__ = true

    const NativeAudio = window.Audio
    const created = []
    Object.defineProperty(window, '__narrationTestAudio', {
      configurable: true,
      value: created,
    })
    function TrackedAudio(...args) {
      const audio = new NativeAudio(...args)
      created.push(audio)
      return audio
    }
    TrackedAudio.prototype = NativeAudio.prototype
    Object.setPrototypeOf(TrackedAudio, NativeAudio)
    window.Audio = TrackedAudio
  })
}

async function boot(page) {
  await page.goto('/projects/astro')
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await expect(page.locator('#article-reader')).toBeAttached()
}

async function injectNarration(page, src = '/media/Astro/menu.mp3') {
  await page.evaluate(source => {
    const app = window.__JG1500_APP__
    const current = app?.state?.item
    if (!app || !current) throw new Error('JG-1500 test runtime is unavailable')

    app.state.item = {
      ...current,
      id: `${current.id}-narration-test`,
      narration: source,
    }
    app.dirty = true
    app.__articleCRTBridge?.syncSource()
    app.__articleCRTBridge?.documentRaster?.markDirty()
  }, src)

  const toggle = page.locator('.document-narration-toggle')
  await expect(page.locator('.document-narration-layer')).toBeVisible()
  await expect(toggle).toBeVisible()
  return toggle
}

test('non-narratable documents expose no active narration control or N shortcut hint', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration interaction contract only needs one browser engine')
  await installNarrationHarness(page)
  await boot(page)

  await expect(page.locator('.document-narration-layer')).toBeHidden()
  await expect(page.locator('.document-narration-toggle')).not.toBeVisible()
  await expect(page.locator('#hint')).not.toContainText('N NARRATE')
  await page.keyboard.press('n')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(0)
})

test('wheel over narration controls scrolls the document reader', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration wheel relay only needs one desktop browser engine')
  await installNarrationHarness(page)
  await boot(page)
  const toggle = await injectNarration(page)
  const reader = page.locator('#article-reader')

  await reader.evaluate(node => { node.scrollTop = 0 })
  await toggle.dispatchEvent('wheel', {
    deltaY: 72,
    deltaMode: 0,
    bubbles: true,
    cancelable: true,
  })
  await expect.poll(() => reader.evaluate(node => node.scrollTop)).toBeGreaterThan(0)
})

test('contextual N shortcut toggles narration without stealing focused interactive controls', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration keyboard routing only needs one desktop browser engine')
  await installNarrationHarness(page)
  await boot(page)
  const toggle = await injectNarration(page)

  await expect(page.locator('#hint')).toContainText('N NARRATE')
  await expect(toggle).toHaveAttribute('aria-keyshortcuts', 'N')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(0)

  await page.keyboard.press('n')
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(1)

  await page.keyboard.press('N')
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')

  await toggle.focus()
  await toggle.press('n')
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')

  await page.evaluate(() => {
    const app = window.__JG1500_APP__
    app.state.item = { ...app.state.item, narration: '' }
    app.dirty = true
    app.__articleCRTBridge?.syncSource()
  })
  await expect(page.locator('#hint')).not.toContainText('N NARRATE')
  await page.locator('body').click({ position: { x: 1, y: 1 }, force: true })
  await page.keyboard.press('n')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(1)
})

test('activated narration becomes one sticky control surface without changing document height', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Sticky narration behaviour only needs one desktop browser engine')
  await installNarrationHarness(page)
  await boot(page)
  const toggle = await injectNarration(page)
  const host = page.locator('.document-narration-controls')
  const reader = page.locator('#article-reader')

  const initialScrollHeight = await reader.evaluate(node => node.scrollHeight)
  await reader.evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(page.locator('.document-narration-layer')).toBeHidden()
  await expect(host).not.toHaveAttribute('data-narration-presentation', 'sticky')

  await reader.evaluate(node => { node.scrollTop = 0 })
  await expect(toggle).toBeVisible()
  await toggle.click({ force: true })
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(1)

  await reader.evaluate(node => { node.scrollTop = node.scrollHeight })
  await expect(host).toHaveAttribute('data-narration-presentation', 'sticky')
  await expect(page.locator('.document-narration-layer')).toBeVisible()
  await expect(page.locator('.document-narration-progress')).toBeVisible()
  expect(await reader.evaluate(node => node.scrollHeight)).toBe(initialScrollHeight)
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('narration-player-sticky.png'), fullPage: true })

  await toggle.click({ force: true })
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(1)

  await reader.evaluate(node => { node.scrollTop = 0 })
  await expect(host).toHaveAttribute('data-narration-presentation', 'primary')
  await expect(toggle).toBeVisible()
})

test('narration supports native keyboard activation, seek, end state and quiet time updates', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration interaction contract only needs one browser engine')
  await installNarrationHarness(page)
  await boot(page)
  const toggle = await injectNarration(page)

  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('narration-player-idle.png'), fullPage: true })

  await toggle.focus()
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(1)

  const progress = page.locator('.document-narration-progress')
  await expect(progress).toBeVisible()
  await expect(progress).toHaveAttribute('aria-label', 'Narration progress for ASTRO')
  await expect(progress).toBeEnabled()

  await progress.evaluate(node => {
    node.value = String(Math.min(5, Number(node.max) || 5))
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect.poll(() => page.evaluate(() => Math.round(window.__narrationTestAudio[0]?.currentTime || 0))).toBe(5)
  await page.screenshot({ path: testInfo.outputPath('narration-player-active.png'), fullPage: true })

  const live = page.locator('.document-narration-live')
  await page.evaluate(() => {
    const liveRegion = document.querySelector('.document-narration-live')
    window.__narrationLiveMutations = 0
    const observer = new MutationObserver(records => {
      window.__narrationLiveMutations += records.length
    })
    observer.observe(liveRegion, { childList: true, characterData: true, subtree: true })
    window.__narrationLiveObserver = observer
    const audio = window.__narrationTestAudio[0]
    for (let index = 0; index < 5; index++) audio.dispatchEvent(new Event('timeupdate'))
  })
  await page.waitForTimeout(50)
  expect(await page.evaluate(() => window.__narrationLiveMutations)).toBe(0)
  await expect(live).toContainText('Playing narration for ASTRO')

  await toggle.press(' ')
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')
  await page.evaluate(() => {
    const audio = window.__narrationTestAudio[0]
    audio.pause()
    audio.currentTime = Number.isFinite(audio.duration) ? audio.duration : 180
    audio.dispatchEvent(new Event('ended'))
  })
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(progress).toBeVisible()
  await expect(progress).toHaveValue('0')
  await expect(live).toContainText('Narration for ASTRO finished')

  await page.evaluate(() => {
    const app = window.__JG1500_APP__
    app.state.item = {
      ...app.state.item,
      id: 'astro-narration-next',
      label: 'ASTRO NEXT',
      narration: '/media/Astro/menu.mp3',
    }
    app.dirty = true
    app.__articleCRTBridge?.syncSource()
  })
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO NEXT')
  await expect(live).toHaveText('')
})

test('narration native hit targets follow raster geometry in fullscreen', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration geometry only needs one desktop browser engine')
  await page.setViewportSize({ width: 960, height: 540 })
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Test: CSS fullscreen'))
  })
  await installNarrationHarness(page)
  await boot(page)
  const toggle = await injectNarration(page)

  await page.locator('#fullscreen-switch').click()
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  await expect(toggle).toBeVisible()

  const idleGeometry = await page.evaluate(() => {
    const player = window.__JG1500_APP__?.__articleCRTBridge?.narrationPlayer
    const host = player?.host?.getBoundingClientRect()
    const button = player?.button?.getBoundingClientRect()
    const entry = player?.entry
    if (!host || !button || !entry) return null
    return {
      actualButtonRatio: button.width / host.width,
      expectedButtonRatio: Math.min(126, entry.width) / entry.width,
    }
  })
  expect(idleGeometry).not.toBeNull()
  expect(Math.abs(idleGeometry.actualButtonRatio - idleGeometry.expectedButtonRatio)).toBeLessThan(0.015)

  await toggle.click({ force: true })
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')
  const activeGeometry = await page.evaluate(() => {
    const player = window.__JG1500_APP__?.__articleCRTBridge?.narrationPlayer
    const host = player?.host?.getBoundingClientRect()
    const progress = player?.progress?.getBoundingClientRect()
    const entry = player?.entry
    if (!host || !progress || !entry) return null
    return {
      actualProgressLeftRatio: (progress.left - host.left) / host.width,
      expectedProgressLeftRatio: Math.min(84, entry.width) / entry.width,
      actualProgressWidthRatio: progress.width / host.width,
      expectedProgressWidthRatio: Math.max(0, entry.width - Math.min(84, entry.width)) / entry.width,
    }
  })
  expect(activeGeometry).not.toBeNull()
  expect(Math.abs(activeGeometry.actualProgressLeftRatio - activeGeometry.expectedProgressLeftRatio)).toBeLessThan(0.015)
  expect(Math.abs(activeGeometry.actualProgressWidthRatio - activeGeometry.expectedProgressWidthRatio)).toBeLessThan(0.015)
})

test('mobile sticky narration keeps play and seek controls inside the usable CRT aperture', async ({ page }, testInfo) => {
  test.skip(!isMobileChromium(testInfo), 'Touch contract runs on the mobile Chromium project')
  await installNarrationHarness(page)
  await boot(page)
  const toggle = await injectNarration(page)

  await toggle.tap()
  await expect(toggle).toHaveAttribute('aria-label', 'Pause narration for ASTRO')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(1)

  const progress = page.locator('.document-narration-progress')
  await expect(progress).toBeVisible()
  await expect(progress).toBeEnabled()
  const box = await progress.boundingBox()
  expect(box).not.toBeNull()
  await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await expect.poll(() => page.evaluate(() => window.__narrationTestAudio[0]?.currentTime || 0)).toBeGreaterThan(0)

  await page.locator('#article-reader').evaluate(node => { node.scrollTop = node.scrollHeight })
  const host = page.locator('.document-narration-controls')
  await expect(host).toHaveAttribute('data-narration-presentation', 'sticky')
  await expect(progress).toBeVisible()

  const geometry = await page.evaluate(() => {
    const player = window.__JG1500_APP__?.__articleCRTBridge?.narrationPlayer
    const tube = document.getElementById('tube')?.getBoundingClientRect()
    const hostRect = player?.host?.getBoundingClientRect()
    const rasteriser = player?.rasteriser
    if (!tube || !hostRect || !rasteriser) return null
    const usableBottom = tube.top + tube.height * (rasteriser.getDocumentContentBottom() / rasteriser.height)
    return {
      tubeTop: tube.top,
      tubeLeft: tube.left,
      tubeRight: tube.right,
      hostTop: hostRect.top,
      hostLeft: hostRect.left,
      hostRight: hostRect.right,
      hostBottom: hostRect.bottom,
      usableBottom,
    }
  })
  expect(geometry).not.toBeNull()
  expect(geometry.hostTop).toBeGreaterThanOrEqual(geometry.tubeTop - 1)
  expect(geometry.hostLeft).toBeGreaterThanOrEqual(geometry.tubeLeft - 1)
  expect(geometry.hostRight).toBeLessThanOrEqual(geometry.tubeRight + 1)
  expect(geometry.hostBottom).toBeLessThanOrEqual(geometry.usableBottom + 2)
  await page.screenshot({ path: testInfo.outputPath('narration-player-sticky-mobile.png'), fullPage: true })

  await toggle.tap()
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')
})

test('narration failure exposes local retry through N', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration failure path only needs one browser engine')
  await installNarrationHarness(page)
  await page.route('**/media/Astro/menu.mp3', route => route.fulfill({
    status: 404,
    contentType: 'audio/mpeg',
    body: '',
  }))

  await boot(page)
  const toggle = await injectNarration(page)
  await page.keyboard.press('n')

  await expect(toggle).toHaveAttribute('aria-label', 'Retry narration for ASTRO')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.document-narration-progress')).toBeHidden()
  await expect(page.locator('.document-narration-description')).toContainText('Narration unavailable for ASTRO')
  await expect(page.locator('.document-narration-live')).toContainText('Narration unavailable for ASTRO')
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(1)

  await page.keyboard.press('n')
  await expect.poll(() => page.evaluate(() => window.__narrationTestAudio.length)).toBe(2)
  await expect(toggle).toHaveAttribute('aria-label', 'Retry narration for ASTRO')
})
