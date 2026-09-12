const MAX_FRAMEBUFFER_PIXELS = 8_388_608
const MAX_FRAMEBUFFER_DIMENSION = 4096

function positive(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function aspectRatio(width, height) {
  return positive(width) / positive(height)
}

export function aspectDistance(a, b) {
  if (!(a > 0) || !(b > 0)) return Number.POSITIVE_INFINITY
  return Math.abs(Math.log(a / b))
}

export function fitScale(viewportWidth, viewportHeight, contentWidth, contentHeight, mode = 'contain') {
  const widthRatio = positive(viewportWidth) / positive(contentWidth)
  const heightRatio = positive(viewportHeight) / positive(contentHeight)
  if (mode === 'cover') return Math.max(widthRatio, heightRatio)
  if (mode !== 'contain') throw new TypeError(`Unknown fit mode: ${mode}`)
  return Math.min(widthRatio, heightRatio)
}

export function fittedRect(viewportWidth, viewportHeight, contentWidth, contentHeight, mode = 'contain') {
  const width = positive(viewportWidth)
  const height = positive(viewportHeight)
  const sourceWidth = positive(contentWidth)
  const sourceHeight = positive(contentHeight)
  const scale = fitScale(width, height, sourceWidth, sourceHeight, mode)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const x = (width - renderedWidth) * 0.5
  const y = (height - renderedHeight) * 0.5

  return {
    scale,
    x,
    y,
    width: renderedWidth,
    height: renderedHeight,
    gapX: Math.max(0, x),
    gapY: Math.max(0, y),
  }
}

export function framebufferSize(width, height, dpr = 1, maxDimension = MAX_FRAMEBUFFER_DIMENSION) {
  const physicalWidth = positive(width)
  const physicalHeight = positive(height)
  const requestedDpr = positive(dpr)
  const dimensionLimit = Math.max(
    1,
    Math.min(
      MAX_FRAMEBUFFER_DIMENSION,
      Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : MAX_FRAMEBUFFER_DIMENSION,
    ),
  )
  const density = Math.min(
    Math.max(1, requestedDpr),
    2,
    dimensionLimit / Math.max(physicalWidth, physicalHeight),
    Math.sqrt(MAX_FRAMEBUFFER_PIXELS / (physicalWidth * physicalHeight)),
  )

  return {
    density,
    pixelWidth: Math.max(1, Math.floor(physicalWidth * density)),
    pixelHeight: Math.max(1, Math.floor(physicalHeight * density)),
  }
}

/**
 * Shared logical contract for CRT-backed display modes.
 *
 * Mode adapters decide their authored margins, typography scale and physical
 * surface scale. This helper only resolves the centred terminal, framebuffer
 * budget and document viewport from those decisions.
 */
export function displayLayout({
  width,
  height,
  sourceWidth,
  sourceHeight,
  bottom = 0,
  textScale = 1,
  physicalScale = 1,
  dpr = 1,
  maxDimension = MAX_FRAMEBUFFER_DIMENSION,
}) {
  width = positive(width)
  height = positive(height)
  sourceWidth = positive(sourceWidth)
  sourceHeight = positive(sourceHeight)
  textScale = positive(textScale)
  physicalScale = positive(physicalScale)
  bottom = Math.min(Math.max(0, Number.isFinite(bottom) ? bottom : 0), Math.max(0, height - 1))

  const terminal = fittedRect(width, height - bottom, sourceWidth, sourceHeight, 'contain')
  const framebuffer = framebufferSize(
    width * physicalScale,
    height * physicalScale,
    dpr,
    maxDimension,
  )

  return {
    width,
    height,
    textScale,
    bottom,
    terminal: {
      x: terminal.x,
      y: terminal.y,
      width: terminal.width,
      height: terminal.height,
    },
    pixelWidth: framebuffer.pixelWidth,
    pixelHeight: framebuffer.pixelHeight,
    documentWidth: width / textScale,
    documentHeight: height / textScale,
    documentBottom: bottom / textScale,
  }
}
