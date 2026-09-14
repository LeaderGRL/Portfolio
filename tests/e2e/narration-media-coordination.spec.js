import { test, expect } from '@playwright/test'

const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'
const audioControl = (page, src) => page.locator(`.document-audio-hotspot[data-audio-src="${src}"]`)

async function installAudioHarness(page) {
  await page.addInitScript(() => {
    window.__JG1500_VISUAL_TEST__ = true

    const NativeAudio = window.Audio
    const created = []
    Object.defineProperty(window, '__coordTestAudio', {
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
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await expect(page.locator('#article-reader')).toBeAttached()

  await page.evaluate(() => {
    const app = window.__JG1500_APP__
    const current = app?.state?.item
    if (!app || !current) throw new Error('JG-1500 test runtime is unavailable')

    const item = {
      ...current,
      id: `${current.id}-media-coordination-test`,
      narration: '/media/Astro/menu.mp3',
    }
    window.__coordNarratableItem = item
    app.state.item = item
    app.dirty = true
    app.__articleCRTBridge?.syncSource()
  })

  await expect(page.locator('.document-narration-toggle')).toBeVisible()
}

async function blurInteractiveFocus(page) {
  await page.evaluate(() => document.activeElement?.blur?.())
}

async function scrollToGameplayVideo(page) {
  const video = page.locator('#article-reader video').first()
  await expect(video).toBeAttached()
  await video.evaluate(node => node.scrollIntoView({ block: 'center' }))
  const hotspot = page.locator('.document-video-hotspot').first()
  await expect(hotspot).toBeVisible()
  return { video, hotspot }
}

async function scrollToSoundtrack(page) {
  const heading = page.locator('#article-reader').getByRole('heading', { name: 'SOUNDTRACK' })
  await expect(heading).toBeAttached()
  await heading.evaluate(node => node.scrollIntoView({ block: 'start' }))
  const menu = audioControl(page, '/media/Astro/menu.mp3')
  await expect(menu).toHaveAttribute('aria-label', 'Play MENU')
  return menu
}

async function narrationAudioState(page) {
  return page.evaluate(() => {
    const runtime = window.__JG1500_APP__?.__articleCRTBridge
    const snapshot = runtime?.audioPlayback?.snapshotNarration?.()
    const audio = runtime?.audioPlayback?.tracks?.get('narration:projects:astro-media-coordination-test')?.audio
    return {
      paused: audio?.paused ?? true,
      state: snapshot?.state || null,
      currentTime: snapshot?.currentTime || 0,
    }
  })
}

async function documentAudioState(page, src) {
  return page.evaluate(source => {
    const playback = window.__JG1500_APP__?.__articleCRTBridge?.audioPlayback
    const track = playback?.tracks?.get(source)
    const snapshot = track ? playback.snapshotTrack(track) : null
    return {
      paused: track?.audio?.paused ?? true,
      state: snapshot?.state || null,
      currentTime: snapshot?.currentTime || 0,
    }
  }, src)
}

test('narration, normal audio and audible local video arbitrate through one document runtime', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Document media arbitration only needs one browser engine')
  await installAudioHarness(page)
  await bootNarratableAstro(page)

  await page.keyboard.press('n')
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: false, state: 'playing' })

  // Audible local video starts while narration is active -> narration pauses.
  const firstVideo = await scrollToGameplayVideo(page)
  await firstVideo.hotspot.click({ force: true })
  await expect.poll(() => firstVideo.video.evaluate(node => node.paused)).toBe(false)
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: true, state: 'paused' })

  // Narration starts while local video is active -> video pauses.
  await blurInteractiveFocus(page)
  await page.keyboard.press('n')
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: false, state: 'playing' })
  await expect.poll(() => firstVideo.video.evaluate(node => node.paused)).toBe(true)

  // Normal document audio starts while narration is active -> narration pauses.
  let menu = await scrollToSoundtrack(page)
  await menu.click({ force: true })
  await expect.poll(() => documentAudioState(page, '/media/Astro/menu.mp3')).toMatchObject({ paused: false, state: 'playing' })
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: true, state: 'paused' })

  // Narration starts while normal document audio is active -> normal audio pauses.
  await blurInteractiveFocus(page)
  await page.keyboard.press('n')
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: false, state: 'playing' })
  await expect.poll(() => documentAudioState(page, '/media/Astro/menu.mp3')).toMatchObject({ paused: true, state: 'paused' })

  // Audible local video starts while narration is active -> narration pauses again.
  let videoState = await scrollToGameplayVideo(page)
  await videoState.hotspot.click({ force: true })
  await expect.poll(() => videoState.video.evaluate(node => node.paused)).toBe(false)
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: true, state: 'paused' })

  // Normal audio starts while the local video keeps playing offscreen -> video pauses.
  menu = await scrollToSoundtrack(page)
  await menu.click({ force: true })
  await expect.poll(() => documentAudioState(page, '/media/Astro/menu.mp3')).toMatchObject({ paused: false, state: 'playing' })
  await expect.poll(() => videoState.video.evaluate(node => node.paused)).toBe(true)

  // Local video starts while normal audio is active -> normal audio pauses.
  videoState = await scrollToGameplayVideo(page)
  await videoState.hotspot.click({ force: true })
  await expect.poll(() => videoState.video.evaluate(node => node.paused)).toBe(false)
  await expect.poll(() => documentAudioState(page, '/media/Astro/menu.mp3')).toMatchObject({ paused: true, state: 'paused' })
})

test('muted local video may continue while narration plays', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Muted video coexistence only needs one browser engine')
  await installAudioHarness(page)
  await bootNarratableAstro(page)

  const { video, hotspot } = await scrollToGameplayVideo(page)
  await video.evaluate(node => { node.muted = true })
  await hotspot.click({ force: true })
  await expect.poll(() => video.evaluate(node => node.paused)).toBe(false)

  await blurInteractiveFocus(page)
  await page.keyboard.press('n')
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: false, state: 'playing' })
  await expect.poll(() => video.evaluate(node => node.paused)).toBe(false)
})

test('POWER and BACK pause narration, retain position and never auto-resume', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Narration lifecycle contract only needs one browser engine')
  await installAudioHarness(page)
  await bootNarratableAstro(page)

  await page.keyboard.press('n')
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: false, state: 'playing' })

  await page.evaluate(() => {
    const audio = window.__JG1500_APP__?.__articleCRTBridge?.audioPlayback?.tracks
      ?.get('narration:projects:astro-media-coordination-test')?.audio
    audio.currentTime = 37
    audio.dispatchEvent(new Event('timeupdate'))
  })

  await page.locator('#power').click()
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: true, state: 'paused', currentTime: 37 })

  await page.locator('#power').click()
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: true, state: 'paused', currentTime: 37 })

  await blurInteractiveFocus(page)
  await page.keyboard.press('n')
  await expect.poll(() => narrationAudioState(page)).toMatchObject({ paused: false, state: 'playing' })
  await page.evaluate(() => {
    const audio = window.__JG1500_APP__?.__articleCRTBridge?.audioPlayback?.tracks
      ?.get('narration:projects:astro-media-coordination-test')?.audio
    audio.currentTime = 52
    audio.dispatchEvent(new Event('timeupdate'))
  })

  await blurInteractiveFocus(page)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/projects$/)

  const retained = await page.evaluate(() => {
    const runtime = window.__JG1500_APP__?.__articleCRTBridge
    return runtime?.audioPlayback?.narrationSession?.read('projects:astro-media-coordination-test') || null
  })
  expect(retained).toMatchObject({ activated: true, currentTime: 52 })
  expect(await page.evaluate(() => window.__coordTestAudio.every(audio => audio.paused))).toBe(true)
})
