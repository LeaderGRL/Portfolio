import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const projectsKey = page => page.getByRole('button', { name: 'PROJECTS' })
const articlesKey = page => page.getByRole('button', { name: 'ARTICLES' })
const isMobileProject = testInfo => testInfo.project.name.includes('mobile')
const isChromiumDesktop = testInfo => testInfo.project.name === 'chromium'
const PORTRAIT_TARGETS = ['320x568','360x640','360x720','360x740','360x780','360x800','375x667','375x812','390x844','393x852','393x873','412x869','412x884','412x915','414x736','414x896','428x926','430x932','440x956']

async function boot(page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#machine')).toBeVisible()
  await expect(page.locator('#tube')).toBeVisible()
  const section = (path.split('/')[1] || 'home').toUpperCase()
  await expect(page.locator('#nav-keys .key.is-on')).toHaveAttribute('aria-label', section)
}

async function compactGeometry(page) {
  return page.evaluate(() => {
    const machine = document.getElementById('machine').getBoundingClientRect()
    const rootStyle = getComputedStyle(document.documentElement)
    const chassis = document.querySelector('.machine__background--mobile img')
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      machine,
      fit: Number.parseFloat(rootStyle.getPropertyValue('--fit')) || 0,
      profile: document.getElementById('machine').dataset.portraitProfile || '',
      portraitStage: document.body.classList.contains('is-portrait-profile-stage'),
      chassisSource: chassis?.currentSrc || chassis?.src || '',
      aperture: ['--portrait-ap-l','--portrait-ap-t','--portrait-ap-r','--portrait-ap-b']
        .map(name => Number.parseFloat(rootStyle.getPropertyValue(name))),
    }
  })
}

function expectFullBleedPortraitGeometry(dimensions) {
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1)
  expect(Math.abs(dimensions.machine.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(dimensions.machine.top)).toBeLessThanOrEqual(1)
  expect(Math.abs(dimensions.machine.width - dimensions.innerWidth)).toBeLessThanOrEqual(1)
  expect(Math.abs(dimensions.machine.height - dimensions.innerHeight)).toBeLessThanOrEqual(1)
  expect(dimensions.fit).toBeCloseTo(1, 4)
  expect(dimensions.profile).not.toBe('')
  expect(dimensions.portraitStage).toBe(true)
  expect(dimensions.chassisSource).toMatch(/^data:image\/webp/i)
  const [left, top, right, bottom] = dimensions.aperture
  expect(left).toBeGreaterThan(0)
  expect(top).toBeGreaterThan(0)
  expect(right).toBeGreaterThan(left)
  expect(bottom).toBeGreaterThan(top)
  expect(right).toBeLessThan(1)
  expect(bottom).toBeLessThan(.65)
}

test('panel navigation keeps terminal arrows active after clicking PROJECTS', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Hardware-keyboard scenario is covered by desktop browser engines')
  await boot(page)
  await projectsKey(page).click()
  await expect(page).toHaveURL(/\/projects$/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/projects\/.+/)
})

test('ARTICLES supports keyboard selection and browser history', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Hardware-keyboard scenario is covered by desktop browser engines')
  test.setTimeout(60_000)

  await boot(page)

  // The physical key has continuous CRT/panel animation around it. A forced
  // click still exercises the real button handler but avoids Playwright waiting
  // for visual "stability" that an animated surface can never strictly reach.
  await articlesKey(page).click({ force: true })
  await expect(page).toHaveURL(/\/articles$/)

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/articles\/.+/)
  const detailUrl = page.url()

  await page.goBack({ waitUntil: 'commit' })
  await expect(page).toHaveURL(/\/articles$/)
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'terminal')

  await page.goForward({ waitUntil: 'commit' })
  await expect(page).toHaveURL(detailUrl)
  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
})

test('volume retains its own keyboard boundary', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Hardware-keyboard scenario is covered by desktop browser engines')
  await boot(page, '/projects')
  const slider = page.locator('#volume')
  await slider.focus()
  const before = Number(await slider.getAttribute('aria-valuenow'))
  await page.keyboard.press('ArrowDown')
  const after = Number(await slider.getAttribute('aria-valuenow'))
  expect(after).toBeLessThan(before)
  await expect(page).toHaveURL(/\/projects$/)
})

test('mobile can open a project directly by tapping a CRT listing row', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Touch-only interaction scenario')
  test.setTimeout(60_000)

  await boot(page)
  await projectsKey(page).tap()
  await expect(page).toHaveURL(/\/projects$/)

  const tube = await page.locator('#tube').boundingBox()
  if (!tube) throw new Error('CRT tube has no touchable bounding box')

  const sourceY = 32 + 3 * 14 + 7
  await page.touchscreen.tap(tube.x + tube.width * 0.5, tube.y + tube.height * (sourceY / 360))

  await expect(page.locator('#tube')).toHaveAttribute('data-display-mode', 'article')
  await expect(page.locator('.article-reader')).toBeAttached()
  await expect(page).toHaveURL(/\/projects\/.+/)
})

test('deep project links render without uncaught page errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await boot(page, '/projects/penw')
  await expect(page).toHaveURL(/\/projects\/penw$/)
  await expect(page.locator('.article-reader')).toBeAttached()
  expect(errors).toEqual([])
})

test('mobile portrait geometry is profile-driven and full bleed', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only layout assertion')
  await boot(page)
  await expect(page.locator('#machine')).toHaveClass(/is-portrait-profile/)
  expectFullBleedPortraitGeometry(await compactGeometry(page))
})

test('tablet portrait geometry uses the nearest full-bleed profile', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Tablet geometry only needs one browser engine')
  await page.setViewportSize({ width: 768, height: 1024 })
  await boot(page)
  await expect(page.locator('#machine')).toHaveClass(/is-portrait-profile/)
  expectFullBleedPortraitGeometry(await compactGeometry(page))
})

test('short portrait falls back before the control deck can clip', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Fallback geometry only needs one browser engine')
  await page.setViewportSize({ width: 375, height: 500 })
  await boot(page)

  await expect(page.locator('#machine')).toHaveClass(/is-compact/)
  await expect(page.locator('#machine')).not.toHaveClass(/is-portrait-profile/)
  await expect(page.locator('body')).toHaveClass(/is-compact-stage/)

  const viewportHeight = await page.evaluate(() => innerHeight)
  const power = await page.getByRole('button', { name: 'Power' }).boundingBox()
  expect(power).not.toBeNull()
  expect(power.y + power.height).toBeLessThanOrEqual(viewportHeight + 1)
})

test('portrait frame gaps are continued with photographed chassis material', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Material continuation only needs one browser engine')
  await page.setViewportSize({ width: 360, height: 780 })
  await boot(page)
  await expect(page.locator('#machine')).toHaveAttribute('data-portrait-profile', '360x780')

  const continuation = await page.locator('.machine__background--mobile').evaluate(background => {
    const root = getComputedStyle(document.documentElement)
    const overlay = getComputedStyle(background, '::after')
    return {
      bottomGap: Number.parseFloat(root.getPropertyValue('--portrait-gap-bottom')) || 0,
      images: overlay.backgroundImage,
      sizes: overlay.backgroundSize,
    }
  })

  expect(continuation.bottomGap).toBeGreaterThan(80)
  expect(continuation.images).toContain('data:image/webp')
  expect(continuation.sizes).toContain(`${continuation.bottomGap}px`)
})

test('all authored portrait resolutions select their exact profile', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Profile selection is engine-independent')
  await page.goto('/')
  for (const id of PORTRAIT_TARGETS) {
    const [width, height] = id.split('x').map(Number)
    await page.setViewportSize({ width, height })
    await expect(page.locator('#machine')).toHaveAttribute('data-portrait-profile', id)
    await expect(page.locator('body')).toHaveClass(/is-portrait-profile-stage/)
  }
})

test('portrait keeps the shared tactile key hardware', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Computed hardware styling only needs one engine')
  test.setTimeout(90_000)
  await page.goto('/')
  for (const id of PORTRAIT_TARGETS) {
    const [width, height] = id.split('x').map(Number)
    const viewport = { width, height }
    await page.setViewportSize(viewport)
    await expect(page.locator('#machine')).toHaveAttribute('data-portrait-profile', id)
    await expect(page.locator('#nav-keys .key.is-on')).toHaveAttribute('aria-label', 'HOME')

    const hardware = await page.getByRole('button', { name: 'HOME' }).evaluate(key => {
      const button = key.querySelector('.key__button')
      const face = key.querySelector('.key__face')
      const led = key.querySelector('.key__led')
      const root = getComputedStyle(document.documentElement)
      const keyStyle = getComputedStyle(key)
      const cavityStyle = getComputedStyle(key, '::before')
      const inset = Number.parseFloat(cavityStyle.top) || 0
      return {
        keySurface: keyStyle.getPropertyValue('--key-surface').trim(),
        sharedCream: root.getPropertyValue('--cream-2').trim(),
        keyHeight: key.getBoundingClientRect().height,
        inset,
        cavity: cavityStyle.backgroundImage,
        cap: button ? getComputedStyle(button).backgroundImage : 'none',
        face: face ? getComputedStyle(face).backgroundImage : 'none',
        ledShadow: led ? getComputedStyle(led).boxShadow : 'none',
      }
    })

    expect(hardware.keySurface).toBe(hardware.sharedCream)
    expect(hardware.cavity).toContain('linear-gradient')
    expect(hardware.cap).toContain('linear-gradient')
    expect(hardware.face).toContain('radial-gradient')
    expect(hardware.ledShadow).not.toBe('none')
    expect(hardware.inset, id).toBeGreaterThanOrEqual(2.25)
    expect((hardware.keyHeight - hardware.inset * 2) / hardware.keyHeight).toBeLessThanOrEqual(.84)
  }
})

test('portrait power separator stays between display controls and power hardware', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Portrait geometry only needs one browser engine')
  test.setTimeout(90_000)
  await page.goto('/')
  for (const id of PORTRAIT_TARGETS) {
    const [width, height] = id.split('x').map(Number)
    const viewport = { width, height }
    await page.setViewportSize(viewport)
    await expect(page.locator('#machine')).toHaveAttribute('data-portrait-profile', id)

    const geometry = await page.locator('.panel--right').evaluate(panel => {
      const root = getComputedStyle(document.documentElement)
      const value = name => Number.parseFloat(root.getPropertyValue(name)) || 0
      const controlsTop = value('--portrait-controls-top')
      const controlsHeight = value('--portrait-controls-height')
      const powerTop = value('--portrait-power-top')
      const captionSize = value('--portrait-caption-size')
      const separatorOffset = value('--portrait-power-separator-offset')
      return {
        controlsBottom: controlsTop + controlsHeight,
        powerLabelTop: powerTop - captionSize * 1.7,
        separatorTop: powerTop + separatorOffset,
        separatorOffset,
        pseudoTop: Number.parseFloat(getComputedStyle(panel.querySelector('.bottom-row'), '::before').top) || 0,
      }
    })

    expect(geometry.pseudoTop, id).toBeCloseTo(geometry.separatorOffset, 1)
    expect(geometry.separatorTop, id).toBeGreaterThan(geometry.controlsBottom + 1)
    expect(geometry.separatorTop, id).toBeLessThan(geometry.powerLabelTop - 1)
  }
})

test('semantic article focus has a visible CRT proxy', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'One real browser engine is sufficient for focus projection geometry')
  await boot(page, '/projects/penw')

  const source = page.locator('.article-reader a[href]').first()
  await expect(source).toBeAttached()
  await source.focus()

  const proxy = page.locator('.semantic-focus-proxy')
  await expect(proxy).toBeVisible()
  const box = await proxy.boundingBox()
  expect(box?.width || 0).toBeGreaterThanOrEqual(24)
  expect(box?.height || 0).toBeGreaterThanOrEqual(24)
})

test('generic imported article image alternatives are contextualized', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Semantic content only needs one engine for this assertion')
  await boot(page, '/articles/01-ecs-entity-management')
  // Article loading is async; collecting immediately can observe an empty
  // reader when the test runner is faster than the document fetch.
  await expect(page.locator('.article-reader img').first()).toBeAttached()
  const alts = await page.locator('.article-reader img').evaluateAll(images => images.map(image => image.getAttribute('alt') || ''))
  expect(alts.length).toBeGreaterThan(0)
  expect(alts.some(alt => /^article illustration$/i.test(alt.trim()))).toBe(false)
})

test('serious accessibility violations are absent across representative routes', async ({ page }, testInfo) => {
  test.skip(!isChromiumDesktop(testInfo), 'Axe DOM rules are engine-independent; keep CI time bounded')
  test.setTimeout(90_000)

  const routes = [
    '/',
    '/about',
    '/resume',
    '/projects',
    '/articles',
    '/contact',
    '/projects/penw',
    '/articles/01-ecs-entity-management',
  ]

  for (const route of routes) {
    await boot(page, route)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    expect(serious, `${route}\n${serious.map(v => `${v.id}: ${v.help}`).join('\n')}`).toEqual([])
  }
})
