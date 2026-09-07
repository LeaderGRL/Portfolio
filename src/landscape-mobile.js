import frame3x2 from '../assets/src/chassis-frame-landscape-3x2.webp?inline'
import frame16x9 from '../assets/src/chassis-frame-landscape-16x9.webp?inline'
import frame21x9 from '../assets/src/chassis-frame-landscape-21x9.webp?inline'

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

function resizeDisplay(app) {
  if (app.state?.fullscreen) return

  const tube = document.getElementById('tube')
  if (app.crt?.ok && tube) {
    app.crt.resize(
      tube.offsetWidth || 1,
      tube.offsetHeight || 1,
      Math.min(devicePixelRatio || 1, 2),
    )
  }
  app._fitRaster?.()
}

export function installLandscapeMobileLayout(app) {
  const machine = document.getElementById('machine')
  if (!machine || typeof app?._fit !== 'function') return () => {}

  const root = document.documentElement.style
  const { layer, image } = installBackground(machine)
  const originalFit = app._fit.bind(app)
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
    ]) root.removeProperty(property)
  }

  const applyLandscape = () => {
    const width = innerWidth || 1
    const height = innerHeight || 1
    const active = isMobileLandscape(width, height)

    if (!active) {
      const changed = machine.classList.contains('is-landscape-mobile')
      machine.classList.remove('is-landscape-mobile')
      delete machine.dataset.landscapeVariant
      document.body.classList.remove('is-landscape-mobile-stage')
      layer.hidden = true
      activeLayout = null
      clearLandscapeProperties()
      if (changed) resizeDisplay(app)
      return
    }

    const layout = closestLayout(width / height)
    const fit = Math.min(width / layout.width, height / layout.height)
    const renderedWidth = layout.width * fit
    const renderedHeight = layout.height * fit
    const [left, top, right, bottom] = layout.aperture

    machine.classList.remove('is-compact')
    machine.classList.add('is-landscape-mobile')
    machine.dataset.landscapeVariant = layout.id
    document.body.classList.remove('is-compact-stage')
    document.body.classList.add('is-landscape-mobile-stage')

    root.setProperty('--fit', fit.toFixed(6))
    root.setProperty('--landscape-design-w', `${layout.width}px`)
    root.setProperty('--landscape-design-h', `${layout.height}px`)
    root.setProperty('--landscape-ap-l', String(left))
    root.setProperty('--landscape-ap-t', String(top))
    root.setProperty('--landscape-ap-r', String(right))
    root.setProperty('--landscape-ap-b', String(bottom))
    root.setProperty('--landscape-render-w', `${renderedWidth}px`)
    root.setProperty('--landscape-render-h', `${renderedHeight}px`)
    root.setProperty('--landscape-gap-x', `${Math.max(0, (width - renderedWidth) * 0.5)}px`)
    root.setProperty('--landscape-gap-y', `${Math.max(0, (height - renderedHeight) * 0.5)}px`)

    if (activeLayout !== layout.id) image.src = layout.src
    layer.hidden = false
    activeLayout = layout.id
    resizeDisplay(app)
  }

  app._fit = () => {
    originalFit()
    applyLandscape()
  }

  app._fit()

  return () => {
    app._fit = originalFit
    machine.classList.remove('is-landscape-mobile')
    delete machine.dataset.landscapeVariant
    document.body.classList.remove('is-landscape-mobile-stage')
    clearLandscapeProperties()
    layer.remove()
    originalFit()
  }
}
