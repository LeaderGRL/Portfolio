import { test, expect } from '@playwright/test'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'
const audioControl = (page, src) => page.locator(`.document-audio-hotspot[data-audio-src="${src}"]`)

async function trackAudioCreation(page) {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio
    const created = []
    Object.defineProperty(window, '__astroTestAudio', {
      configurable: true,
      value: created,
    })
    function TrackedAudio(...args) {
      const audio = new NativeAudio(...args)
      audio.__testId = created.length + 1
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

async function scrollToSoundtrack(page) {
  const heading = page.locator('#article-reader').getByRole('heading', { name: 'SOUNDTRACK' })
  await expect(heading).toBeAttached()
  await heading.evaluate(node => node.scrollIntoView({ block: 'start' }))
  await expect(audioControl(page, '/media/Astro/menu.mp3')).toBeAttached()
  await expect(audioControl(page, '/media/Astro/in-game.mp3')).toBeAttached()
}

async function revealSoundtrack(page) {
  await scrollToSoundtrack(page)
  await expect(audioControl(page, '/media/Astro/menu.mp3')).toHaveAttribute('aria-label', 'Play MENU')
  await expect(audioControl(page, '/media/Astro/in-game.mp3')).toHaveAttribute('aria-label', 'Play IN-GAME')
}

test('Astro audio is lazy, keyboard accessible and keeps time updates out of the live region', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Audio network lifecycle only needs one browser engine')
  await trackAudioCreation(page)

  const mp3Requests = []
  page.on('request', request => {
    if (/\/media\/Astro\/[^/?]+\.mp3(?:\?|$)/.test(request.url())) mp3Requests.push(request.url())
  })

  await boot(page)
  await revealSoundtrack(page)
  await page.waitForTimeout(300)
  expect(mp3Requests).toEqual([])
  expect(await page.evaluate(() => window.__astroTestAudio.length)).toBe(0)

  const menu = audioControl(page, '/media/Astro/menu.mp3')
  await expect(menu).toHaveAttribute('aria-pressed', 'false')
  const progressId = await menu.getAttribute('aria-describedby')
  expect(progressId).toBeTruthy()
  await expect(page.locator(`#${progressId}`)).toContainText('Paused')

  await menu.press('Enter')
  await expect.poll(() => mp3Requests.some(url => url.includes('/media/Astro/menu.mp3'))).toBe(true)
  expect(mp3Requests.some(url => /\/(?:in-game|volcano|victory)\.mp3/.test(url))).toBe(false)
  await expect(menu).toHaveAttribute('aria-pressed', 'true')
  await expect(menu).toHaveAttribute('aria-label', 'Pause MENU')

  const live = menu.locator('xpath=..').locator('.document-audio-live')
  await expect(live).toContainText('Playing MENU')
  await page.evaluate(() => {
    const liveRegion = document.querySelector('.document-audio-hotspot[data-audio-src="/media/Astro/menu.mp3"]')
      ?.parentElement?.querySelector('.document-audio-live')
    window.__astroLiveMutations = 0
    const observer = new MutationObserver(records => {
      window.__astroLiveMutations += records.length
    })
    observer.observe(liveRegion, { childList: true, characterData: true, subtree: true })
    window.__astroLiveObserver = observer
    const audio = window.__astroTestAudio[0]
    for (let i = 0; i < 5; i++) audio.dispatchEvent(new Event('timeupdate'))
  })
  await page.waitForTimeout(50)
  expect(await page.evaluate(() => window.__astroLiveMutations)).toBe(0)
})

test('Astro audio reports media failures instead of silently swallowing them', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Failure handling only needs one browser engine')

  await page.route('**/media/Astro/menu.mp3', route => route.fulfill({
    status: 404,
    contentType: 'audio/mpeg',
    body: '',
  }))

  await boot(page)
  await revealSoundtrack(page)

  const menu = audioControl(page, '/media/Astro/menu.mp3')
  const progressId = await menu.getAttribute('aria-describedby')
  await menu.click({ force: true })

  await expect(menu).toHaveAttribute('aria-label', 'Retry MENU')
  await expect(menu).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(`#${progressId}`)).toContainText('Audio unavailable')
  await expect(menu.locator('xpath=..').locator('.document-audio-live')).toContainText('Audio unavailable for MENU')
})

test('Astro audio survives scroll and fullscreen relayout, pauses competitors, follows volume and stops on POWER OFF', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Persistent playback state only needs one browser engine')
  await trackAudioCreation(page)

  await boot(page)
  await revealSoundtrack(page)

  const menu = audioControl(page, '/media/Astro/menu.mp3')
  const inGame = audioControl(page, '/media/Astro/in-game.mp3')

  await menu.click({ force: true })
  await expect(menu).toHaveAttribute('aria-label', 'Pause MENU')

  await inGame.click({ force: true })
  await expect(inGame).toHaveAttribute('aria-label', 'Pause IN-GAME')
  await expect(menu).toHaveAttribute('aria-label', 'Play MENU')

  await page.locator('#volume').evaluate(node => node.setAttribute('aria-valuenow', '23'))
  await expect.poll(() => page.evaluate(() => {
    const active = window.__astroTestAudio.filter(audio => !audio.paused)
    return active.length === 1 && Math.abs(active[0].volume - 0.23) < 0.01
  })).toBe(true)

  const activeId = await page.evaluate(() => window.__astroTestAudio.find(audio => !audio.paused)?.__testId)
  expect(activeId).toBeTruthy()

  await page.locator('#article-reader').evaluate(node => { node.scrollTop = 0 })
  await expect(audioControl(page, '/media/Astro/in-game.mp3')).toHaveCount(0)
  await expect.poll(() => page.evaluate(id => {
    const audio = window.__astroTestAudio.find(item => item.__testId === id)
    return Boolean(audio && !audio.paused && audio.getAttribute('src') === '/media/Astro/in-game.mp3')
  }, activeId)).toBe(true)

  await scrollToSoundtrack(page)
  await expect(audioControl(page, '/media/Astro/in-game.mp3')).toHaveAttribute('aria-label', 'Pause IN-GAME')
  expect(await page.evaluate(() => window.__astroTestAudio.length)).toBe(2)

  await page.locator('#fullscreen-switch').evaluate(node => node.click())
  await expect(page.locator('body')).toHaveClass(/is-crt-fullscreen/)
  await expect.poll(() => page.evaluate(id => {
    const audio = window.__astroTestAudio.find(item => item.__testId === id)
    return Boolean(audio && !audio.paused && audio.getAttribute('src') === '/media/Astro/in-game.mp3')
  }, activeId)).toBe(true)
  expect(await page.evaluate(() => window.__astroTestAudio.length)).toBe(2)

  await page.locator('#power').evaluate(node => node.click())
  await expect.poll(() => page.evaluate(() => window.__astroTestAudio.every(audio => audio.paused))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__astroTestAudio.every(audio => audio.getAttribute('src') === null))).toBe(true)
})

test('swiping an Astro audio card scrolls the article without starting playback', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Pointer gesture relay only needs one browser engine')

  const mp3Requests = []
  page.on('request', request => {
    if (/\/media\/Astro\/[^/?]+\.mp3(?:\?|$)/.test(request.url())) mp3Requests.push(request.url())
  })

  await boot(page)
  await revealSoundtrack(page)
  const reader = page.locator('#article-reader')
  const before = await reader.evaluate(node => node.scrollTop)
  const menu = audioControl(page, '/media/Astro/menu.mp3')

  await menu.evaluate(node => {
    const fire = (type, y) => node.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 71,
      pointerType: 'touch',
      button: 0,
      clientX: 200,
      clientY: y,
    }))
    fire('pointerdown', 320)
    fire('pointermove', 280)
    fire('pointermove', 240)
    fire('pointerup', 240)
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })

  await expect.poll(() => reader.evaluate(node => node.scrollTop)).toBeGreaterThan(before)
  expect(mp3Requests).toEqual([])
})
