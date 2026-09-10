import frame5x4 from '../assets/src/chassis-frame-landscape-5x4.webp?inline'
import frame4x3 from '../assets/src/chassis-frame-landscape-4x3.webp?inline'
import frame3x2 from '../assets/src/chassis-frame-landscape-3x2.webp?inline'
import frame16x10 from '../assets/src/chassis-frame-landscape-16x10.webp?inline'
import frame16x9 from '../assets/src/chassis-frame-landscape-16x9.webp?inline'
import frame20x9 from '../assets/src/chassis-frame-landscape-20x9.webp?inline'
import frame21x9 from '../assets/src/chassis-frame-landscape-21x9.webp?inline'
import frame3x1 from '../assets/src/chassis-frame-landscape-3x1.webp?inline'
import { ASSET_META } from './assets.js'
import { SRC_H, SRC_W, clamp } from './core.js'

// The build measures each supplied frame, including its alpha and edge colours.
// A new chassis can never keep the previous artwork's screen coordinates.
const LANDSCAPE_LAYOUTS = Object.entries({
  '5x4': frame5x4,
  '4x3': frame4x3,
  '3x2': frame3x2,
  '16x10': frame16x10,
  '16x9': frame16x9,
  '20x9': frame20x9,
  '21x9': frame21x9,
  '3x1': frame3x1,
})
  .map(([id, src]) => ({ id, src, ...ASSET_META.landscape_chassis[id] }))

const MOBILE_MAX_WIDTH = 1400
const MOBILE_MAX_HEIGHT = 600
const LANDSCAPE_MIN_ASPECT = 1.05
const SAFE_AREA_PROPERTIES = ['left', 'right', 'top', 'bottom']
const MOULDING_VIEWPORT_MARGIN_MIN = 4
const MOULDING_VIEWPORT_MARGIN_MAX = 10
const EDGE_FILL_SAMPLE_DEPTH = 8

// The control deck follows the approved reference in viewport space instead of
// inheriting arbitrary percentages from each chassis artwork. This keeps the
// hardware centred, breathable and visually stable while the closest supplied
// plate uses the moulding-safe fit and extends only its own cream material.
const CONTROL_DECK = {
  widthRatio: 0.285,
  panoramaWidthRatio: 0.315,
  panoramaStartAspect: 21 / 9,
  panoramaEndAspect: 3,
  materialGapRatio: 0.015,
  materialGapMin: 8,
  materialGapMax: 18,
  topRatio: 0.185,
  bottomMargin: 8,
  keyTarget: 44,
}

function closestLayout(viewportAspect) {
  // Every supplied plate is an authored composition. Choose the nearest ratio
  // rather than forcing the 16:9 goal plate onto panoramic phones: doing so
  // discarded the wider assets and could crop all the way to the CRT moulding.
  return LANDSCAPE_LAYOUTS.reduce((best, candidate) => {
    const candidateAspect = candidate.width / candidate.height
    const bestAspect = best.width / best.height
    return Math.abs(Math.log(viewportAspect / candidateAspect)) < Math.abs(Math.log(viewportAspect / bestAspect))
      ? candidate
      : best
  })
}

function hasTouchInput() {
  const touchPoints = Number(navigator?.maxTouchPoints || 0)
  if (touchPoints <= 0) return false

  /* maxTouchPoints is also non-zero on hybrid Windows laptops. The authored
     phone chassis is appropriate only when touch is the primary interaction,
     otherwise a short desktop window unexpectedly becomes the mobile UI. */
  try {
    return matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches
  } catch {
    return touchPoints > 0
  }
}

function isMobileLandscape(width, height) {
  if (!hasTouchInput() || !(width > 0) || !(height > 0)) return false
  const aspect = width / height
  return aspect >= LANDSCAPE_MIN_ASPECT && height <= MOBILE_MAX_HEIGHT && width <= MOBILE_MAX_WIDTH
}

function readSafeArea(width, height) {
  const style = getComputedStyle(document.documentElement)
  const inset = Object.fromEntries(SAFE_AREA_PROPERTIES.map(edge => {
    const value = Number.parseFloat(style.getPropertyValue(`--safe-area-${edge}`))
    return [edge, Number.isFinite(value) && value > 0 ? value : 0]
  }))

  return {
    ...inset,
    width: Math.max(1, width - inset.left - inset.right),
    height: Math.max(1, height - inset.top - inset.bottom),
  }
}

function mix(a, b, t) {
  return a + (b - a) * t
}

function mouldingSafeFit(viewportWidth, viewportHeight, layout) {
  const contain = Math.min(viewportWidth / layout.width, viewportHeight / layout.height)
  const cover = Math.max(viewportWidth / layout.width, viewportHeight / layout.height)
  const [left, top, right, bottom] = layout.moulding || layout.aperture
  const surroundRight = Math.max(layout.screen_surround_right || right, right)
  const surroundPadPixels = Math.max(0, (surroundRight - right) * layout.width)
  const protectedLeft = Math.max(0, left - surroundPadPixels / layout.width)
  const protectedTop = Math.max(0, top - surroundPadPixels / layout.height)
  const protectedRight = Math.min(1, surroundRight)
  const protectedBottom = Math.min(1, bottom + surroundPadPixels / layout.height)
  const margin = clamp(
    Math.min(viewportWidth, viewportHeight) * .015,
    MOULDING_VIEWPORT_MARGIN_MIN,
    MOULDING_VIEWPORT_MARGIN_MAX,
  )

  const horizontalRadius = Math.max(1, viewportWidth * .5 - margin)
  const verticalRadius = Math.max(1, viewportHeight * .5 - margin)
  const limits = [
    horizontalRadius / (Math.max(.0001, .5 - protectedLeft) * layout.width),
    horizontalRadius / (Math.max(.0001, protectedRight - .5) * layout.width),
    verticalRadius / (Math.max(.0001, .5 - protectedTop) * layout.height),
    verticalRadius / (Math.max(.0001, protectedBottom - .5) * layout.height),
  ]
  const safeMaximum = Math.min(...limits.filter(Number.isFinite))

  // Move toward full bleed only while the complete photographed black
  // moulding remains inside the viewport. Any crop is therefore restricted to
  // the expendable cream perimeter of the authored plate.
  return Math.max(contain, Math.min(cover, safeMaximum))
}

function installBackground(machine) {
  const layer = document.createElement('div')
  layer.className = 'machine__background machine__background--landscape'
  layer.setAttribute('aria-hidden', 'true')

  const image = document.createElement('img')
  image.alt = ''
  image.decoding = 'async'
  layer.appendChild(image)
  machine.prepend(layer)

  return { layer, image }
}

function loadBackground(image, layout) {
  image.dataset.decodeState = 'loading'
  image.src = layout.src

  const mark = state => {
    if (image.src === layout.src || image.currentSrc === layout.src) image.dataset.decodeState = state
  }

  if (typeof image.decode === 'function') {
    image.decode().then(
      () => mark(image.naturalWidth > 0 ? 'ready' : 'error'),
      () => mark('error'),
    )
  } else if (image.complete) {
    mark(image.naturalWidth > 0 ? 'ready' : 'error')
  } else {
    image.addEventListener('load', () => mark('ready'), { once: true })
    image.addEventListener('error', () => mark('error'), { once: true })
  }
}

/**
 * One geometry contract for the embedded landscape CRT.
 *
 * Terminal pages keep their native 4:3 raster inside the wider glass while
 * documents use the complete aperture with a logical width chosen from the
 * final physical size. This makes 10px raster prose land around 11–12.5 CSS px
 * on supported phones instead of being squeezed from the fixed 480px source.
 */
export function landscapeDisplayLayout(width, height, fit = 1, dpr = 1, maxDimension = 4096) {
  width = Math.max(1, width)
  height = Math.max(1, height)
  fit = Number.isFinite(fit) && fit > 0 ? fit : 1

  const physicalWidth = width * fit
  const physicalHeight = height * fit
  const limit = Math.max(1, Math.min(4096, maxDimension || 4096))
  const density = Math.min(
    Math.max(1, dpr || 1),
    2,
    limit / Math.max(physicalWidth, physicalHeight),
    Math.sqrt(8388608 / Math.max(1, physicalWidth * physicalHeight)),
  )

  const terminalScale = Math.min(width / SRC_W, height / SRC_H)
  const terminal = {
    x: (width - SRC_W * terminalScale) * 0.5,
    y: (height - SRC_H * terminalScale) * 0.5,
    width: SRC_W * terminalScale,
    height: SRC_H * terminalScale,
  }

  const physicalDocumentScale = clamp(
    Math.min(physicalWidth / 260, physicalHeight / 150),
    1.08,
    1.25,
  )
  const textScale = physicalDocumentScale / fit

  return {
    width,
    height,
    textScale,
    physicalDocumentScale,
    bottom: 0,
    terminal,
    pixelWidth: Math.max(1, Math.floor(physicalWidth * density)),
    pixelHeight: Math.max(1, Math.floor(physicalHeight * density)),
    documentWidth: width / textScale,
    documentHeight: height / textScale,
    documentBottom: 0,
  }
}

function clearLandscapeRasterProperties(tube) {
  if (!tube) return
  delete tube.dataset.rasterLayout
  for (const property of [
    '--landscape-terminal-x',
    '--landscape-terminal-y',
    '--landscape-terminal-w',
    '--landscape-terminal-h',
    '--landscape-document-scale',
    '--landscape-reader-font',
    '--landscape-reader-title',
    '--landscape-reader-heading',
  ]) tube.style.removeProperty(property)
}

function fitLandscapeRaster(app) {
  const tube = document.getElementById('tube')
  if (!tube) return

  const fit = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1
  const width = tube.offsetWidth || 1
  const height = tube.offsetHeight || 1
  const layout = landscapeDisplayLayout(
    width,
    height,
    fit,
    devicePixelRatio || 1,
    app.crt?.maxDimension,
  )
  const picture = layout.terminal
  const documentMode = Boolean(app.state?.item)
  const rect = documentMode
    ? { x: 0, y: 0, w: 1, h: 1 }
    : {
        x: picture.x / width,
        y: picture.y / height,
        w: picture.width / width,
        h: picture.height / height,
      }

  app.raster.setViewport(layout)
  app.crt.resize(layout.pixelWidth, layout.pixelHeight, 1)
  app.rasterRect = rect
  app.dirty = true

  tube.dataset.rasterLayout = 'landscape'
  tube.style.setProperty('--landscape-terminal-x', `${picture.x.toFixed(3)}px`)
  tube.style.setProperty('--landscape-terminal-y', `${picture.y.toFixed(3)}px`)
  tube.style.setProperty('--landscape-terminal-w', `${picture.width.toFixed(3)}px`)
  tube.style.setProperty('--landscape-terminal-h', `${picture.height.toFixed(3)}px`)
  tube.style.setProperty('--landscape-document-scale', layout.physicalDocumentScale.toFixed(4))
  tube.style.setProperty('--landscape-reader-font', `${(10 * layout.textScale).toFixed(3)}px`)
  tube.style.setProperty('--landscape-reader-title', `${(18 * layout.textScale).toFixed(3)}px`)
  tube.style.setProperty('--landscape-reader-heading', `${(13 * layout.textScale).toFixed(3)}px`)
  // Restore reading progress after the semantic reader has its final font
  // metrics, including when returning from fullscreen or rotating the phone.
  app.documentRuntime?.setViewport?.(layout)
}

function controlDeckGeometry(viewportWidth, viewportHeight, safe, layout, fit, renderedWidth, renderedHeight) {
  const machineLeft = (viewportWidth - renderedWidth) * 0.5
  const machineTop = (viewportHeight - renderedHeight) * 0.5
  const machineRight = machineLeft + renderedWidth
  const moulding = layout.moulding || layout.aperture
  const screenSurroundRight = Math.max(layout.screen_surround_right || moulding[2], moulding[2])
  const surroundPad = Math.max(0, (screenSurroundRight - moulding[2]) * layout.width * fit)
  const screenSurroundTop = machineTop + moulding[1] * layout.height * fit - surroundPad
  const screenSurroundBottom = machineTop + moulding[3] * layout.height * fit + surroundPad
  const screenRight = machineLeft + screenSurroundRight * layout.width * fit
  const bayRight = Math.min(machineRight, viewportWidth - safe.right)
  const viewportAspect = viewportWidth / viewportHeight
  const panorama = clamp(
    (viewportAspect - CONTROL_DECK.panoramaStartAspect)
      / (CONTROL_DECK.panoramaEndAspect - CONTROL_DECK.panoramaStartAspect),
    0,
    1,
  )
  // The rail stays centred in the real cream material bay between the measured
  // CRT surround and the visible right edge. Only its width grows toward 3:1;
  // adding a panorama-only left bias made the controls look shifted right.
  const bayLeft = screenRight
  const bayWidth = bayRight - bayLeft
  const materialGap = clamp(
    viewportWidth * CONTROL_DECK.materialGapRatio,
    CONTROL_DECK.materialGapMin,
    CONTROL_DECK.materialGapMax,
  )

  /* Do not move the rail back across the CRT merely to satisfy a minimum
     width. Near-square viewports are better served by the existing compact
     layout than by an authored landscape chassis with overlapping controls. */
  const narrowViewport = viewportWidth <= 640
  const minimumWidth = narrowViewport ? 148 : clamp(viewportWidth * 0.245, 170, 266)
  const maximumWidth = bayWidth - materialGap * 2
  if (maximumWidth < minimumWidth) return null
  const desiredWidthRatio = mix(CONTROL_DECK.widthRatio, CONTROL_DECK.panoramaWidthRatio, panorama)
  const desiredWidth = viewportWidth * desiredWidthRatio
  const railWidth = Math.min(Math.max(desiredWidth, minimumWidth), maximumWidth)
  const railLeft = bayLeft + (bayWidth - railWidth) * 0.5

  // Scale typography from the physical width that is actually available to
  // the control deck. A viewport breakpoint made 641px jump straight from a
  // 7.25px label to 10px, which was visibly oversized on 667px-wide phones.
  // Keeping the density tied to the fitted rail makes the transition smooth
  // across every authored chassis ratio.
  const deckDensity = clamp((railWidth - 148) / 118, 0, 1)

  // Interpolate from a compact 280px-tall phone to the approved Pixel 7
  // proportions. Ultra-wide browser-chrome viewports are a special physical
  // regime: goal2 keeps the complete control stack inside the CRT recess height,
  // so the target rows compact continuously after 21:9 instead of protruding
  // above and below the photographed screen surround.
  const rhythm = clamp((viewportHeight - 280) / 132, 0, 1)
  const largeRhythm = clamp((viewportHeight - 412) / 188, 0, 1)
  const normalKeyTarget = mix(CONTROL_DECK.keyTarget, 60, largeRhythm)
  const keyTarget = mix(normalKeyTarget, 38, panorama)
  const normalFaceHeight = mix(mix(27.5, 30, rhythm), 42, largeRhythm)
  // The 3:1 reference uses noticeably slimmer physical key caps while the
  // invisible touch targets keep their existing reachability. Interpolating
  // the cap height avoids a viewport-specific override and naturally lowers
  // the visible face inside the unchanged hit area.
  const faceHeight = mix(normalFaceHeight, 23.5, panorama)
  // Keep a real one-pixel gutter even on the shortest supported landscape.
  // Zero-gap rows can overlap by a fractional CSS pixel after the design-space
  // values are scaled back into viewport space on Chromium.
  const rowGap = mix(mix(mix(1, 2, rhythm), 5, largeRhythm), 1, panorama)
  const navActionGap = mix(mix(mix(6, 18, rhythm), 24, largeRhythm), 12, panorama)
  const actionControlsGap = mix(mix(mix(7, 22, rhythm), 30, largeRhythm), 8, panorama)
  const controlsHeight = mix(mix(mix(34, 49, rhythm), 64, largeRhythm), 34, panorama)
  const powerHeight = mix(mix(mix(30, 40, rhythm), 52, largeRhythm), 30, panorama)
  const topMargin = 6
  const baseHeight = keyTarget * 4
    + rowGap * 2
    + navActionGap
    + actionControlsGap
    + controlsHeight
    + powerHeight
  const desiredControlsPowerGap = mix(mix(mix(18, 22, rhythm), 30, largeRhythm), 15, panorama)
  const powerGapCapacity = safe.height - topMargin - CONTROL_DECK.bottomMargin - baseHeight
  if (powerGapCapacity < 4) return null
  const controlsPowerGap = Math.min(desiredControlsPowerGap, powerGapCapacity)
  const totalHeight = baseHeight + controlsPowerGap

  /* The control stack has a real physical minimum because its touch targets
     stay 44px high. If that stack plus safe-area padding cannot fit, forcing
     landscape only clips POWER or navigation; fall back before mutating UI. */
  const requiredHeight = totalHeight + topMargin + CONTROL_DECK.bottomMargin
  if (requiredHeight > safe.height) return null

  const minimumTop = safe.top + topMargin
  const normalIdealTop = viewportHeight * CONTROL_DECK.topRatio
  // The same measured cream recess that protects the CRT crop also owns the
  // ultra-wide vertical rhythm. At 3:1 this lands the first visible key face
  // just inside the bevel, matching goal2 without a 915x300 coordinate hack.
  const panoramaIdealTop = screenSurroundTop + clamp(viewportHeight * .017, 4, 6)
  const idealTop = mix(normalIdealTop, panoramaIdealTop, panorama)
  const maximumTop = viewportHeight - safe.bottom - CONTROL_DECK.bottomMargin - totalHeight
  const navTop = Math.max(minimumTop, Math.min(idealTop, maximumTop))
  const navHeight = keyTarget * 3 + rowGap * 2
  const actionTop = navTop + navHeight + navActionGap
  const controlsTop = actionTop + keyTarget + actionControlsGap
  const powerTop = controlsTop + controlsHeight + controlsPowerGap

  const columnGap = narrowViewport ? 8 : mix(14, 18, clamp((viewportWidth - 667) / 248, 0, 1))
  const separatorThickness = 1.25
  const compactCaptionSize = mix(8, 9.5, deckDensity)
  const captionSize = mix(compactCaptionSize, 11, largeRhythm * deckDensity)
  const normalFontSize = mix(mix(6.7, 8.6, deckDensity), 10.5, largeRhythm * deckDensity)
  const fontSize = mix(normalFontSize, 8.4, panorama)
  const powerLabelOffset = captionSize * 1.35
  const powerRuleFreeSpace = controlsPowerGap - powerLabelOffset
  const powerRuleOffset = -(controlsPowerGap + powerLabelOffset) * 0.5

  const xToDesign = value => (value - machineLeft) / fit
  const yToDesign = value => (value - machineTop) / fit
  const sizeToDesign = value => value / fit

  return {
    railLeft: xToDesign(railLeft),
    railWidth: sizeToDesign(railWidth),
    navTop: yToDesign(navTop),
    actionTop: yToDesign(actionTop),
    controlsTop: yToDesign(controlsTop),
    powerTop: yToDesign(powerTop),
    keyHeight: sizeToDesign(keyTarget),
    keyInset: sizeToDesign((keyTarget - faceHeight) * 0.5),
    rowGap: sizeToDesign(rowGap),
    columnGap: sizeToDesign(columnGap),
    controlsHeight: sizeToDesign(controlsHeight),
    powerHeight: sizeToDesign(powerHeight),
    actionSeparatorOffset: sizeToDesign(-navActionGap * 0.5),
    controlsSeparatorOffset: sizeToDesign(-actionControlsGap * 0.5),
    powerSeparatorOffset: sizeToDesign(powerRuleOffset),
    powerSeparatorOpacity: powerRuleFreeSpace >= 2 ? 1 : 0,
    separatorThickness: sizeToDesign(separatorThickness),
    // Typography follows the fitted deck width instead of a viewport switch.
    // This keeps Firefox-safe narrow labels while avoiding an abrupt size jump
    // on common 667px and 800px landscape phones.
    fontSize: sizeToDesign(fontSize),
    captionSize: sizeToDesign(captionSize),
    iconSize: sizeToDesign(narrowViewport ? 12.25 : mix(14, 17, largeRhythm)),
    iconLeft: sizeToDesign(narrowViewport ? 6 : mix(10, 13, largeRhythm)),
    legendLeft: sizeToDesign(narrowViewport ? 19.5 : mix(34, 42, largeRhythm)),
    ledSize: sizeToDesign(narrowViewport ? 4 : mix(4.5, 6, largeRhythm)),
    ledTop: sizeToDesign(narrowViewport ? 5 : mix(5, 7, largeRhythm)),
    ledRight: sizeToDesign(narrowViewport ? 4 : mix(6, 8, largeRhythm)),
    switchWidth: sizeToDesign(narrowViewport ? 44 : mix(50, 65, largeRhythm)),
    sliderWidth: sizeToDesign(narrowViewport ? 46 : mix(52, 68, largeRhythm)),
    rockerWidth: sizeToDesign(mix(24, 30, largeRhythm)),
  }
}

export function installLandscapeMobileLayout(app) {
  const machine = document.getElementById('machine')
  if (!machine || typeof app?._fit !== 'function' || typeof app?._fitRaster !== 'function') return () => {}

  const root = document.documentElement.style
  const { layer, image } = installBackground(machine)
  const originalFit = app._fit.bind(app)
  const originalFitRaster = app._fitRaster.bind(app)
  let activeLayout = null

  const clearLandscapeProperties = () => {
    for (const property of [
      '--landscape-design-w',
      '--landscape-design-h',
      '--landscape-ap-l',
      '--landscape-ap-t',
      '--landscape-ap-r',
      '--landscape-ap-b',
      '--landscape-mould-l',
      '--landscape-mould-t',
      '--landscape-mould-r',
      '--landscape-mould-b',
      '--landscape-screen-surround-r',
      '--landscape-render-w',
      '--landscape-render-h',
      '--landscape-gap-x',
      '--landscape-gap-y',
      '--landscape-center-x',
      '--landscape-center-y',
      '--landscape-controls-left',
      '--landscape-controls-width',
      '--landscape-nav-top',
      '--landscape-action-top',
      '--landscape-controls-top',
      '--landscape-power-top',
      '--landscape-key-h',
      '--landscape-key-inset',
      '--landscape-row-gap',
      '--landscape-column-gap',
      '--landscape-controls-height',
      '--landscape-power-height',
      '--landscape-action-separator-offset',
      '--landscape-controls-separator-offset',
      '--landscape-power-separator-offset',
      '--landscape-power-separator-opacity',
      '--landscape-separator-thickness',
      '--landscape-font-size',
      '--landscape-caption-size',
      '--landscape-icon-size',
      '--landscape-icon-left',
      '--landscape-legend-left',
      '--landscape-led-size',
      '--landscape-led-top',
      '--landscape-led-right',
      '--landscape-switch-width',
      '--landscape-slider-width',
      '--landscape-rocker-width',
      '--landscape-edge-top',
      '--landscape-edge-bottom',
      '--landscape-edge-left',
      '--landscape-edge-right',
      '--landscape-fill-image',
      '--landscape-edge-fill-w',
      '--landscape-edge-fill-h',
    ]) root.removeProperty(property)
  }

  const deactivateLandscape = () => {
    machine.classList.remove('is-landscape-mobile')
    delete machine.dataset.landscapeVariant
    document.body.classList.remove('is-landscape-mobile-stage')
    layer.hidden = true
    activeLayout = null
    clearLandscapeProperties()
    clearLandscapeRasterProperties(document.getElementById('tube'))
  }

  app._fitRaster = () => {
    if (!app.state?.fullscreen && machine.classList.contains('is-landscape-mobile')) {
      fitLandscapeRaster(app)
      return
    }
    clearLandscapeRasterProperties(document.getElementById('tube'))
    originalFitRaster()
  }

  const applyLandscape = (viewportWidth, viewportHeight, safe) => {
    const layout = closestLayout(viewportWidth / viewportHeight)
    // Fill as much of the viewport as the artwork safely allows. The fitted
    // plate may lose only its exterior cream perimeter; the measured black CRT
    // moulding is never allowed to cross a viewport edge. Any remaining strip
    // is extended from the exact edge material.
    const fit = mouldingSafeFit(viewportWidth, viewportHeight, layout)
    const renderedWidth = layout.width * fit
    const renderedHeight = layout.height * fit
    const [left, top, right, bottom] = layout.aperture
    const [mouldLeft, mouldTop, mouldRight, mouldBottom] = layout.moulding || layout.aperture
    const screenSurroundRight = Math.max(layout.screen_surround_right ?? mouldRight, mouldRight)
    const deck = controlDeckGeometry(
      viewportWidth,
      viewportHeight,
      safe,
      layout,
      fit,
      renderedWidth,
      renderedHeight,
    )
    if (!deck) return false

    machine.classList.remove('is-compact')
    machine.classList.add('is-landscape-mobile')
    machine.dataset.landscapeVariant = layout.id
    document.body.classList.remove('is-compact-stage')
    document.body.classList.add('is-landscape-mobile-stage')

    for (const property of ['--compact-render-w', '--compact-render-h', '--compact-gap-x', '--compact-gap-y']) {
      root.removeProperty(property)
    }

    root.setProperty('--fit', fit.toFixed(6))
    root.setProperty('--landscape-design-w', `${layout.width}px`)
    root.setProperty('--landscape-design-h', `${layout.height}px`)
    root.setProperty('--landscape-ap-l', String(left))
    root.setProperty('--landscape-ap-t', String(top))
    root.setProperty('--landscape-ap-r', String(right))
    root.setProperty('--landscape-ap-b', String(bottom))
    root.setProperty('--landscape-mould-l', String(mouldLeft))
    root.setProperty('--landscape-mould-t', String(mouldTop))
    root.setProperty('--landscape-mould-r', String(mouldRight))
    root.setProperty('--landscape-mould-b', String(mouldBottom))
    root.setProperty('--landscape-screen-surround-r', String(screenSurroundRight))
    root.setProperty('--landscape-render-w', `${renderedWidth}px`)
    root.setProperty('--landscape-render-h', `${renderedHeight}px`)
    root.setProperty('--landscape-center-x', `${viewportWidth * 0.5}px`)
    root.setProperty('--landscape-center-y', `${viewportHeight * 0.5}px`)
    const gapX = Math.max(0, (viewportWidth - renderedWidth) * .5)
    const gapY = Math.max(0, (viewportHeight - renderedHeight) * .5)
    root.setProperty('--landscape-gap-x', `${gapX}px`)
    root.setProperty('--landscape-gap-y', `${gapY}px`)
    root.setProperty('--landscape-edge-top', layout.edges.top)
    root.setProperty('--landscape-edge-bottom', layout.edges.bottom)
    root.setProperty('--landscape-edge-left', layout.edges.left)
    root.setProperty('--landscape-edge-right', layout.edges.right)
    root.setProperty('--landscape-fill-image', `url("${layout.src}")`)
    // Magnify only a tiny outer strip of source pixels across each continuation
    // region. CSS mirrors the strip so the seam itself is always source pixel
    // zero: plate and continuation therefore meet on identical material.
    root.setProperty('--landscape-edge-fill-w', `${Math.max(1, gapX * layout.width / EDGE_FILL_SAMPLE_DEPTH)}px`)
    root.setProperty('--landscape-edge-fill-h', `${Math.max(1, gapY * layout.height / EDGE_FILL_SAMPLE_DEPTH)}px`)

    for (const [property, value] of [
      ['--landscape-controls-left', deck.railLeft],
      ['--landscape-controls-width', deck.railWidth],
      ['--landscape-nav-top', deck.navTop],
      ['--landscape-action-top', deck.actionTop],
      ['--landscape-controls-top', deck.controlsTop],
      ['--landscape-power-top', deck.powerTop],
      ['--landscape-key-h', deck.keyHeight],
      ['--landscape-key-inset', deck.keyInset],
      ['--landscape-row-gap', deck.rowGap],
      ['--landscape-column-gap', deck.columnGap],
      ['--landscape-controls-height', deck.controlsHeight],
      ['--landscape-power-height', deck.powerHeight],
      ['--landscape-action-separator-offset', deck.actionSeparatorOffset],
      ['--landscape-controls-separator-offset', deck.controlsSeparatorOffset],
      ['--landscape-power-separator-offset', deck.powerSeparatorOffset],
      ['--landscape-separator-thickness', deck.separatorThickness],
      ['--landscape-font-size', deck.fontSize],
      ['--landscape-caption-size', deck.captionSize],
      ['--landscape-icon-size', deck.iconSize],
      ['--landscape-icon-left', deck.iconLeft],
      ['--landscape-legend-left', deck.legendLeft],
      ['--landscape-led-size', deck.ledSize],
      ['--landscape-led-top', deck.ledTop],
      ['--landscape-led-right', deck.ledRight],
      ['--landscape-switch-width', deck.switchWidth],
      ['--landscape-slider-width', deck.sliderWidth],
      ['--landscape-rocker-width', deck.rockerWidth],
    ]) root.setProperty(property, `${value.toFixed(3)}px`)
    root.setProperty('--landscape-power-separator-opacity', String(deck.powerSeparatorOpacity))

    if (activeLayout !== layout.id) loadBackground(image, layout)
    layer.hidden = false
    activeLayout = layout.id
    fitLandscapeRaster(app)
    return true
  }

  app._fit = () => {
    const width = innerWidth || 1
    const height = innerHeight || 1
    const safe = readSafeArea(width, height)
    const active = !app.state?.fullscreen && isMobileLandscape(width, height)

    if (!active) {
      deactivateLandscape()
      originalFit()
      return
    }

    if (!applyLandscape(width, height, safe)) {
      deactivateLandscape()
      originalFit()
    }
  }

  app._fit()

  return () => {
    deactivateLandscape()
    app._fitRaster = originalFitRaster
    app._fit = originalFit
    layer.remove()
    originalFit()
  }
}
