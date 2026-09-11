import { ASSETS, ASSET_META } from './assets.js'
import { clamp } from './core.js'

const PORTRAIT_MAX_ASPECT = 1.05

const PORTRAIT_PROFILES = (ASSET_META.portrait_chassis?.profiles || []).map(profile => ({
  ...profile,
  src: ASSETS[profile.asset],
}))

export function resolvePortraitProfile(width, height, profiles = PORTRAIT_PROFILES) {
  if (!profiles.length) return null
  const exactId = `${Math.round(width)}x${Math.round(height)}`
  const exact = profiles.find(profile => profile.id === exactId)
  if (exact) return exact

  const viewportAspect = width / Math.max(1, height)
  return profiles.reduce((best, candidate) => {
    const [candidateWidth, candidateHeight] = candidate.viewport
    const candidateAspect = candidateWidth / candidateHeight
    const aspectError = Math.abs(Math.log(viewportAspect / candidateAspect))
    const widthError = Math.abs(Math.log(width / candidateWidth))
    const heightError = Math.abs(Math.log(height / candidateHeight))
    const score = aspectError * 5 + widthError * .35 + heightError * .35
    return !best || score < best.score ? { profile: candidate, score } : best
  }, null).profile
}

export function portraitDeckGeometry(width, height) {
  const aspect = width / Math.max(1, height)
  const tallness = clamp((height / Math.max(1, width) - 1.78) / .42, 0, 1)
  const deckTop = height * (.532 + tallness * .012)
  const deckBottom = height - clamp(height * .032, 14, 32)
  const railMargin = clamp(width * (.02 + .14 * aspect), 28, 40)
  const columnGap = clamp(width * .045, 14, 20)
  const railWidth = Math.max(120, width - railMargin * 2)
  const keyWidth = (railWidth - columnGap) * .5
  const keyHeight = clamp(width * .125 - 11, 28, 44)
  // Match the approved landscape hardware contract: the complete row remains
  // the touch target while a shorter physical cap sits inside it. Keeping the
  // cavity almost as tall as the hit target made narrow portrait keys read as
  // heavy outlined pills even though they shared the desktop materials.
  const keyFaceReduction = clamp(width * .025, 7, 11)
  const keyFaceHeight = clamp(keyHeight - keyFaceReduction, 23.5, 31)
  const keyInset = Math.max(0, (keyHeight - keyFaceHeight) * .5)
  const rowGap = clamp(width * .035 - 4, 7, 13)
  const actionGap = clamp(width * .04 - 6, 8, 14)
  const navHeight = keyHeight * 3 + rowGap * 2
  const actionTop = deckTop + navHeight + actionGap
  const controlsHeight = clamp(width * .09, 29, 40)
  const powerHeight = clamp(width * .13, 42, 58)
  const captionSize = clamp(width * .026, 8.5, 12)
  const fixedBottom = actionTop + keyHeight + controlsHeight + powerHeight
  const availableSpacing = deckBottom - fixedBottom
  // POWER owns a label above the rocker. Reserve enough real space for that
  // label plus a visible divider gutter before deciding the portrait can fit.
  // Without this contract the 414x736 profile technically fit, but its divider
  // landed against the display-control tier instead of between both groups.
  const minimumActionControlsGap = 6
  const minimumControlsPowerGap = captionSize * 1.7 + 8
  const minimumSpacing = minimumActionControlsGap + minimumControlsPowerGap
  const fits = availableSpacing >= minimumSpacing
  const remaining = Math.max(minimumSpacing, availableSpacing)
  const controlsPowerGap = clamp(
    remaining * .55,
    minimumControlsPowerGap,
    remaining - minimumActionControlsGap,
  )
  const actionControlsGap = remaining - controlsPowerGap
  const controlsTop = actionTop + keyHeight + actionControlsGap
  const powerTop = controlsTop + controlsHeight + controlsPowerGap
  const controlsBottom = controlsTop + controlsHeight
  const powerLabelTop = powerTop - captionSize * 1.7
  const powerSeparatorTop = controlsBottom + Math.max(0, powerLabelTop - controlsBottom) * .5

  return {
    railLeft: railMargin,
    railWidth,
    keyWidth,
    keyHeight,
    keyFaceHeight,
    keyInset,
    columnGap,
    rowGap,
    navTop: deckTop,
    actionTop,
    controlsTop,
    controlsHeight,
    powerTop,
    powerHeight,
    powerSeparatorOffset: powerSeparatorTop - powerTop,
    fits,
    fontSize: clamp(width * .029, 9, 13),
    captionSize,
    iconSize: clamp(width * .047, 15, 21),
    iconLeft: clamp(width * .035, 10, 16),
    legendLeft: clamp(width * .12, 38, 53),
    ledSize: clamp(width * .017, 5, 7.5),
    ledTop: clamp(width * .023, 7, 10),
    ledRight: clamp(width * .025, 8, 11),
    switchWidth: clamp(width * .17, 54, 76),
    sliderWidth: clamp(width * .18, 58, 80),
    rockerWidth: clamp(width * .10, 32, 44),
    separatorThickness: 1,
  }
}

function publishPixels(style, values) {
  for (const [name, value] of Object.entries(values)) {
    style.setProperty(`--portrait-${name}`, `${value.toFixed(3)}px`)
  }
}

export function installPortraitMobileLayout(app) {
  const machine = document.getElementById('machine')
  const image = machine?.querySelector('.machine__background--mobile img')
  if (!machine || !image || typeof app?._fit !== 'function') return () => {}

  const root = document.documentElement.style
  const originalFit = app._fit.bind(app)
  const originalMobileSource = image.src
  let activeProfile = null

  const clearProperties = () => {
    for (const name of [
      'ap-l', 'ap-t', 'ap-r', 'ap-b',
      'frame-x', 'frame-y', 'frame-scale-x', 'frame-scale-y',
      'gap-top', 'gap-right', 'gap-bottom', 'gap-left',
      'rail-left', 'rail-width', 'key-width', 'key-height', 'key-inset', 'column-gap', 'row-gap',
      'nav-top', 'action-top', 'controls-top', 'controls-height', 'power-top', 'power-height', 'power-separator-offset',
      'font-size', 'caption-size', 'icon-size', 'icon-left', 'legend-left',
      'led-size', 'led-top', 'led-right', 'switch-width', 'slider-width', 'rocker-width',
      'separator-thickness',
    ]) root.removeProperty(`--portrait-${name}`)
  }

  const deactivate = () => {
    if (!activeProfile) return
    machine.classList.remove('is-portrait-profile')
    delete machine.dataset.portraitProfile
    document.body.classList.remove('is-portrait-profile-stage')
    clearProperties()
    image.src = originalMobileSource
    activeProfile = null
  }

  const apply = (width, height, geometry = portraitDeckGeometry(width, height)) => {
    const profile = resolvePortraitProfile(width, height)
    if (!profile) return false
    const [left, top, right, bottom] = profile.reference_aperture || profile.aperture
    const [frameX, frameY, frameScaleX, frameScaleY] = profile.frame_transform || [0, 0, 1, 1]
    const gapTop = Math.max(0, frameY * height)
    const gapRight = Math.max(0, (1 - frameX - frameScaleX) * width)
    const gapBottom = Math.max(0, (1 - frameY - frameScaleY) * height)
    const gapLeft = Math.max(0, frameX * width)

    machine.classList.add('is-compact', 'is-portrait-profile')
    machine.dataset.portraitProfile = profile.id
    document.body.classList.remove('is-compact-stage')
    document.body.classList.add('is-portrait-profile-stage')
    root.setProperty('--fit', '1')
    root.setProperty('--portrait-ap-l', String(left))
    root.setProperty('--portrait-ap-t', String(top))
    root.setProperty('--portrait-ap-r', String(right))
    root.setProperty('--portrait-ap-b', String(bottom))
    root.setProperty('--portrait-frame-x', String(frameX))
    root.setProperty('--portrait-frame-y', String(frameY))
    root.setProperty('--portrait-frame-scale-x', String(frameScaleX))
    root.setProperty('--portrait-frame-scale-y', String(frameScaleY))
    publishPixels(root, {
      'rail-left': geometry.railLeft,
      'rail-width': geometry.railWidth,
      'key-width': geometry.keyWidth,
      'key-height': geometry.keyHeight,
      'key-inset': geometry.keyInset,
      'column-gap': geometry.columnGap,
      'row-gap': geometry.rowGap,
      'nav-top': geometry.navTop,
      'action-top': geometry.actionTop,
      'controls-top': geometry.controlsTop,
      'controls-height': geometry.controlsHeight,
      'power-top': geometry.powerTop,
      'power-height': geometry.powerHeight,
      'power-separator-offset': geometry.powerSeparatorOffset,
      'font-size': geometry.fontSize,
      'caption-size': geometry.captionSize,
      'icon-size': geometry.iconSize,
      'icon-left': geometry.iconLeft,
      'legend-left': geometry.legendLeft,
      'led-size': geometry.ledSize,
      'led-top': geometry.ledTop,
      'led-right': geometry.ledRight,
      'switch-width': geometry.switchWidth,
      'slider-width': geometry.sliderWidth,
      'rocker-width': geometry.rockerWidth,
      'separator-thickness': geometry.separatorThickness,
      'gap-top': gapTop > 0 ? gapTop + 2 : 0,
      'gap-right': gapRight > 0 ? gapRight + 2 : 0,
      'gap-bottom': gapBottom > 0 ? gapBottom + 2 : 0,
      'gap-left': gapLeft > 0 ? gapLeft + 2 : 0,
    })

    if (activeProfile !== profile.id) image.src = profile.src
    activeProfile = profile.id

    const tube = document.getElementById('tube')
    if (app.crt?.ok && tube) {
      app.crt.resize(
        tube.offsetWidth || Math.max(1, width * (right - left)),
        tube.offsetHeight || Math.max(1, height * (bottom - top)),
        Math.min(devicePixelRatio || 1, 2),
      )
    }
    app._fitRaster?.()
    return true
  }

  app._fit = options => {
    const width = innerWidth || 1
    const height = innerHeight || 1
    const portrait = !app.state?.fullscreen && width / height < PORTRAIT_MAX_ASPECT

    if (!portrait) {
      deactivate()
      originalFit(options)
      return
    }

    const geometry = portraitDeckGeometry(width, height)
    if (!geometry.fits) {
      deactivate()
      originalFit({ forceCompact: true })
      return
    }

    // Let the inner landscape/base fitter clear any state from the previous
    // orientation exactly once before the portrait profile takes ownership.
    if (!activeProfile) originalFit({ forceCompact: true })
    apply(width, height, geometry)
  }

  app._fit()

  return () => {
    deactivate()
    app._fit = originalFit
    originalFit()
  }
}
