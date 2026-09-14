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

test('non-narratable documents expose no active narration control', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration interaction contract only needs one browser engine')
  await installNarrationHarness(page)
  await boot(page)

  await expect(page.locator('.document-narration-layer')).toBeHidden()
  await expect(page.locator('.document-narration-toggle')).not.toBeVisible()
  expect(await page.evaluate(() => window.__narrationTestAudio.length)).toBe(0)
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
    audio.currentTime = Number.isFinite(audio.duration) ? audio.duration : 180
    audio.dispatchEvent(new Event('ended'))
  })
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(progress).toBeVisible()
  await expect(progress).toHaveValue('0')
  await expect(live).toContainText('Narration for ASTRO finished')
})

test('narration touch controls can start playback and seek', async ({ page }, testInfo) => {
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
})

test('narration failure exposes a local retry action', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration failure path only needs one browser engine')
  await installNarrationHarness(page)
  await page.route('**/media/Astro/menu.mp3', route => route.fulfill({
    status: 404,
    contentType: 'audio/mpeg',
    body: '',
  }))

  await boot(page)
  const toggle = await injectNarration(page)
  await toggle.click({ force: true })

  await expect(toggle).toHaveAttribute('aria-label', 'Retry narration for ASTRO')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.document-narration-progress')).toBeHidden()
  await expect(page.locator('.document-narration-description')).toContainText('Narration unavailable for ASTRO')
  await expect(page.locator('.document-narration-live')).toContainText('Narration unavailable for ASTRO')
})
