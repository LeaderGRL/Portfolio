import { test, expect } from '@playwright/test'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'
const audioButton = (page, index) => page.locator('.document-audio-hotspot').nth(index)

async function boot(page) {
  await page.goto('/projects/astro')
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await expect(page.locator('#article-reader')).toBeAttached()
}

async function revealSoundtrack(page) {
  const reader = page.locator('#article-reader')
  const heading = reader.getByRole('heading', { name: 'SOUNDTRACK' })
  await expect(heading).toBeAttached()
  await heading.evaluate(node => node.scrollIntoView({ block: 'start' }))

  const controls = page.locator('.document-audio-hotspot')
  await expect(controls).toHaveCount(4)
  await expect(audioButton(page, 0)).toHaveAttribute('aria-label', 'Play MENU')
  await expect(audioButton(page, 1)).toHaveAttribute('aria-label', 'Play IN-GAME')
}

test('Astro audio performs no MP3 request before explicit playback', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Network lifecycle only needs one browser engine')

  const mp3Requests = []
  page.on('request', request => {
    if (/\/media\/Astro\/[^/?]+\.mp3(?:\?|$)/.test(request.url())) mp3Requests.push(request.url())
  })

  await boot(page)
  await revealSoundtrack(page)
  await page.waitForTimeout(500)
  expect(mp3Requests).toEqual([])

  const menu = audioButton(page, 0)
  await expect(menu).toHaveAttribute('aria-pressed', 'false')
  const statusId = await menu.getAttribute('aria-describedby')
  expect(statusId).toBeTruthy()
  await expect(page.locator(`#${statusId}`)).toContainText('Paused')

  await menu.click({ force: true })
  await expect.poll(() => mp3Requests.some(url => url.includes('/media/Astro/menu.mp3'))).toBe(true)
  expect(mp3Requests.some(url => /\/(?:in-game|volcano|victory)\.mp3/.test(url))).toBe(false)
  await expect(menu).toHaveAttribute('aria-pressed', 'true')
  await expect(menu).toHaveAttribute('aria-label', 'Pause MENU')
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

  const menu = audioButton(page, 0)
  const statusId = await menu.getAttribute('aria-describedby')
  await menu.click({ force: true })

  await expect(menu).toHaveAttribute('aria-label', 'Retry MENU')
  await expect(menu).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(`#${statusId}`)).toContainText('Audio unavailable')
})

test('Astro audio pauses competing tracks, follows volume and stops on POWER OFF', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Audio state inspection only needs one browser engine')

  await page.addInitScript(() => {
    const NativeAudio = window.Audio
    const created = []
    Object.defineProperty(window, '__astroTestAudio', {
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

  await boot(page)
  await revealSoundtrack(page)

  const menu = audioButton(page, 0)
  const inGame = audioButton(page, 1)

  await menu.click({ force: true })
  await expect(menu).toHaveAttribute('aria-pressed', 'true')
  await expect(menu).toHaveAttribute('aria-label', 'Pause MENU')

  await inGame.click({ force: true })
  await expect(inGame).toHaveAttribute('aria-pressed', 'true')
  await expect(inGame).toHaveAttribute('aria-label', 'Pause IN-GAME')
  await expect(menu).toHaveAttribute('aria-pressed', 'false')
  await expect(menu).toHaveAttribute('aria-label', 'Play MENU')

  await page.locator('#volume').evaluate(node => node.setAttribute('aria-valuenow', '23'))
  await expect.poll(() => page.evaluate(() => {
    const active = window.__astroTestAudio.filter(audio => !audio.paused)
    return active.length === 1 && Math.abs(active[0].volume - 0.23) < 0.01
  })).toBe(true)

  await page.locator('#power').click({ force: true })
  await expect.poll(() => page.evaluate(() => window.__astroTestAudio.every(audio => audio.paused))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__astroTestAudio.every(audio => audio.getAttribute('src') === null))).toBe(true)
})
