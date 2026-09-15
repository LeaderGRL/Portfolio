import { test, expect } from '@playwright/test'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'
const FIXTURE_SRC = '/media/Astro/menu.mp3'
const FIXTURE_ID = 'astro-production-regression'
const SESSION_KEY = `projects:${FIXTURE_ID}`

async function installNarrationHarness(page) {
  await page.addInitScript(() => {
    window.__JG1500_VISUAL_TEST__ = true

    const NativeAudio = window.Audio
    const created = []
    Object.defineProperty(window, '__productionNarrationAudio', {
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

async function bootNarratableAstro(page) {
  await page.goto('/projects/astro')
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await expect(page.locator('#article-reader')).toBeAttached()
  await injectNarration(page)
}

async function injectNarration(page) {
  await page.evaluate(({ id, source }) => {
    const app = window.__JG1500_APP__
    const current = app?.state?.item
    if (!app || !current) throw new Error('JG-1500 test runtime is unavailable')

    app.state.item = {
      ...current,
      id,
      narration: source,
    }
    app.dirty = true
    app.__articleCRTBridge?.syncSource()
    app.__articleCRTBridge?.documentRaster?.markDirty()
  }, { id: FIXTURE_ID, source: FIXTURE_SRC })

  await expect(page.locator('.document-narration-layer')).toBeVisible()
  await expect(page.locator('.document-narration-toggle')).toBeVisible()
}

async function narrationState(page) {
  return page.evaluate(sessionKey => {
    const playback = window.__JG1500_APP__?.__articleCRTBridge?.audioPlayback
    const snapshot = playback?.snapshotNarration?.() || null
    const track = playback?.tracks?.get(`narration:${sessionKey}`) || null
    return {
      state: snapshot?.state || null,
      activated: snapshot?.activated ?? false,
      currentTime: snapshot?.currentTime || 0,
      paused: track?.audio?.paused ?? true,
      volume: track?.audio?.volume ?? null,
      created: window.__productionNarrationAudio?.length || 0,
    }
  }, SESSION_KEY)
}

async function sessionState(page) {
  return page.evaluate(sessionKey => {
    const runtime = window.__JG1500_APP__?.__articleCRTBridge
    return runtime?.audioPlayback?.narrationSession?.read(sessionKey) || null
  }, SESSION_KEY)
}

async function setNarrationTime(page, currentTime) {
  await page.evaluate(({ sessionKey, currentTime }) => {
    const audio = window.__JG1500_APP__?.__articleCRTBridge?.audioPlayback?.tracks
      ?.get(`narration:${sessionKey}`)?.audio
    if (!audio) throw new Error('Narration audio is unavailable')
    audio.currentTime = currentTime
    audio.dispatchEvent(new Event('timeupdate'))
  }, { sessionKey: SESSION_KEY, currentTime })
}

test('mouse activation stays lazy and narration follows physical volume including mute', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration delivery contract only needs one browser engine')

  const narrationRequests = []
  page.on('request', request => {
    if (request.url().includes(FIXTURE_SRC)) narrationRequests.push(request.url())
  })

  await installNarrationHarness(page)
  await bootNarratableAstro(page)

  expect(await page.evaluate(() => window.__productionNarrationAudio.length)).toBe(0)
  expect(narrationRequests).toHaveLength(0)

  await page.locator('#volume').evaluate(node => node.setAttribute('aria-valuenow', '23'))
  await page.locator('.document-narration-toggle').click({ force: true })

  await expect.poll(() => narrationState(page)).toMatchObject({
    state: 'playing',
    paused: false,
    created: 1,
  })
  await expect.poll(() => narrationState(page).then(state => state.volume)).toBeCloseTo(0.23, 2)
  expect(narrationRequests.length).toBeGreaterThan(0)

  await page.locator('#volume').evaluate(node => node.setAttribute('aria-valuenow', '0'))
  await expect.poll(() => narrationState(page)).toMatchObject({
    state: 'playing',
    paused: false,
    volume: 0,
  })

  await setNarrationTime(page, 7)
  const mutedAt = await narrationState(page)
  await page.waitForTimeout(150)
  const mutedLater = await narrationState(page)
  expect(mutedLater.paused).toBe(false)
  expect(mutedLater.state).toBe('playing')
  expect(mutedLater.currentTime).toBeGreaterThanOrEqual(mutedAt.currentTime)
})

test('visibility pauses narration, preserves position and never auto-resumes', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration lifecycle contract only needs one browser engine')

  await installNarrationHarness(page)
  await bootNarratableAstro(page)
  await page.keyboard.press('n')
  await expect.poll(() => narrationState(page)).toMatchObject({ state: 'playing', paused: false })

  await setNarrationTime(page, 19)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await expect.poll(() => narrationState(page)).toMatchObject({ state: 'paused', paused: true })
  const hiddenState = await narrationState(page)
  const hiddenSession = await sessionState(page)
  expect(hiddenState.currentTime).toBeGreaterThanOrEqual(19)
  expect(hiddenSession).toMatchObject({ activated: true })
  expect(hiddenSession.currentTime).toBeCloseTo(hiddenState.currentTime, 1)

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(150)

  const visibleState = await narrationState(page)
  expect(visibleState.paused).toBe(true)
  expect(visibleState.state).toBe('paused')
  expect(visibleState.currentTime).toBeCloseTo(hiddenState.currentTime, 1)
})

test('BACK restores progress paused in-session while refresh resets narration state', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration session contract only needs one browser engine')

  await installNarrationHarness(page)
  await bootNarratableAstro(page)
  await page.keyboard.press('n')
  await expect.poll(() => narrationState(page)).toMatchObject({ state: 'playing', paused: false })
  await setNarrationTime(page, 31)

  await page.evaluate(() => document.activeElement?.blur?.())
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/projects$/)

  const retained = await sessionState(page)
  expect(retained).toMatchObject({ activated: true })
  expect(retained.currentTime).toBeGreaterThanOrEqual(31)
  expect(await page.evaluate(() => window.__productionNarrationAudio.every(audio => audio.paused))).toBe(true)

  // Re-open through the portfolio itself so the same JS runtime/session remains alive.
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/projects\/astro$/)
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await injectNarration(page)

  const toggle = page.locator('.document-narration-toggle')
  const progress = page.locator('.document-narration-progress')
  await expect(toggle).toHaveAttribute('aria-label', 'Play narration for ASTRO')
  await expect(progress).toBeVisible()
  await expect.poll(() => sessionState(page).then(state => state?.currentTime || 0)).toBeCloseTo(retained.currentTime, 1)

  await page.reload()
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await injectNarration(page)

  await expect(page.locator('.document-narration-toggle')).toHaveAttribute('aria-label', 'Play narration for ASTRO')
  await expect(page.locator('.document-narration-progress')).toBeHidden()
  expect(await page.evaluate(() => window.__productionNarrationAudio.length)).toBe(0)

  const resetSession = await sessionState(page)
  expect(resetSession).toMatchObject({ activated: false, currentTime: 0 })

  await page.locator('.document-narration-toggle').click({ force: true })
  await expect.poll(() => narrationState(page)).toMatchObject({ state: 'playing', paused: false, created: 1 })
  expect((await narrationState(page)).currentTime).toBeLessThan(2)
})