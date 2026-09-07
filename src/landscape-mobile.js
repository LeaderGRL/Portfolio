import frame3x2 from '../assets/src/chassis-frame-landscape-3x2.webp?inline'
import frame16x9 from '../assets/src/chassis-frame-landscape-16x9.webp?inline'
import frame21x9 from '../assets/src/chassis-frame-landscape-21x9.webp?inline'
import { SRC_H, SRC_W, clamp } from './core.js'

const LANDSCAPE_LAYOUTS = [
  {
    id: '3x2',
    width: 1536,
    height: 1024,
    aperture: [0.149740, 0.196289, 0.590495, 0.648438],
    src: frame3x2,
  },
  {
    id: '16x9',
    width: 1672,
    height: 941,
    aperture: [0.153110, 0.228480, 0.566388, 0.651435],
    src: frame16x9,
  },
  {
    id: '21x9',
    width: 1916,
    height: 821,
    aperture: [0.140397, 0.200974, 0.536013, 0.685749],
    src: frame21x9,
  },
]

const MOBILE_MAX_WIDTH = 1400
const MOBILE_MAX_HEIGHT = 600
const LANDSCAPE_MIN_ASPECT = 1.05
const SAFE_AREA_PROPERTIES = ['left', 'right', 'top', 'bottom']

function closestLayout(viewportAspect) {
  return LANDSCAPE_LAYOUTS.reduce((best, candidate) => {
    const candidateAspect = candidate.width / candidate.height
    const bestAspect = best.width / best.height
    return Math.abs(Math.log(viewportAspect / candidateAspect)) < Math.abs(Math.log(viewportAspect / bestAspect))
      ? candidate
      : best
  })
}

function isMobileLandscape(width, height) {
  if (!(width > 0) || !(height > 0)) return false
  const aspect = width / height
  return aspect >= LANDSCAPE_MIN_ASPECT && height <= MOBILE_MAX_HEIGHT && width <= MOBILE_MAX_WIDTH
}

function readSafeArea(width, height) {
  const style = getComputedStyle(document.documentElement)
  const inset = Object.fromEntries(SAFE_AREA_PROPERTIES.map(edge => {
    const value = Number.parseFloat(style.getPropertyValue(`--safe-area-${edge}`))
    return [edge, Number.isFinite(value) && value > 0 ? value : 0]
  }))

  const safeWidth = Math.max(1, width - inset.left - inset.right)
  const safeHeight = Math.max(1, height - inset.top - inset.bottom)
  return {
    ...inset,
    width: safeWidth,
    height: safeHeight,
    centerX: inset.left + safeWidth * 0.5,
    centerY: inset.top + safeHeight * 0.5,
  }
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
  app.documentRuntime?.setViewport?.(layout)
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
      '--landscape-render-w',
      '--landscape-render-h',
      '--landscape-gap-x',
      '--landscape-gap-y',
      '--landscape-center-x',
      '--landscape-center-y',
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
    const layout = closestLayout(safe.width / safe.height)
    const fit = Math.min(safe.width / layout.width, safe.height / layout.height)
    const renderedWidth = layout.width * fit
    const renderedHeight = layout.height * fit
    const [left, top, right, bottom] = layout.aperture

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
    root.setProperty('--landscape-render-w', `${renderedWidth}px`)
    root.setProperty('--landscape-render-h', `${renderedHeight}px`)
    root.setProperty('--landscape-center-x', `${safe.centerX}px`)
    root.setProperty('--landscape-center-y', `${safe.centerY}px`)
    root.setProperty('--landscape-gap-x', `${Math.max(0, (viewportWidth - renderedWidth) * 0.5)}px`)
    root.setProperty('--landscape-gap-y', `${Math.max(0, (viewportHeight - renderedHeight) * 0.5)}px`)

    if (activeLayout !== layout.id) loadBackground(image, layout)
    layer.hidden = false
    activeLayout = layout.id
    fitLandscapeRaster(app)
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

    applyLandscape(width, height, safe)
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
