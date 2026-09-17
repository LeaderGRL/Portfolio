import { CRT_CURSOR_SHAPE } from './crt-cursor-shape.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const clamp01 = value => Math.max(0, Math.min(1, value))
const mix = (a, b, t) => a + (b - a) * t

function rgb(color) {
  return `rgb(${color.map(channel => Math.round(channel * 255)).join(' ')})`
}

function mixedRgb(from, to, amount) {
  const t = clamp01(amount)
  return rgb(from.map((value, index) => mix(value, to[index], t)))
}

function polygonPoints(scale = 1) {
  return CRT_CURSOR_SHAPE.points
    .map(([x, y]) => `${(x * scale).toFixed(4)},${(y * scale).toFixed(4)}`)
    .join(' ')
}

export class CrtCursorView {
  constructor(documentRef = globalThis.document) {
    this.document = documentRef
    this.root = null
    this.svg = null
    this.bodyGroup = null
    this.outer = null
    this.inner = null
    this.last = null
  }

  mount(parent = this.document?.body) {
    if (this.root || !this.document || !parent) return this.root

    const root = this.document.createElement('div')
    root.className = 'crt-cursor-dom'
    root.hidden = true
    root.setAttribute('aria-hidden', 'true')

    const svg = this.document.createElementNS(SVG_NS, 'svg')
    svg.classList.add('crt-cursor-dom__svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    svg.setAttribute('viewBox', [
      CRT_CURSOR_SHAPE.bounds.minX,
      CRT_CURSOR_SHAPE.bounds.minY,
      CRT_CURSOR_SHAPE.bounds.maxX - CRT_CURSOR_SHAPE.bounds.minX,
      CRT_CURSOR_SHAPE.bounds.maxY - CRT_CURSOR_SHAPE.bounds.minY,
    ].join(' '))

    const bodyGroup = this.document.createElementNS(SVG_NS, 'g')
    bodyGroup.classList.add('crt-cursor-dom__body')

    const outer = this.document.createElementNS(SVG_NS, 'polygon')
    outer.classList.add('crt-cursor-dom__outer')
    outer.setAttribute('points', polygonPoints(1))

    const inner = this.document.createElementNS(SVG_NS, 'polygon')
    inner.classList.add('crt-cursor-dom__inner')
    inner.setAttribute('points', polygonPoints(CRT_CURSOR_SHAPE.innerScale))

    bodyGroup.append(outer, inner)
    svg.append(bodyGroup)
    root.append(svg)
    parent.append(root)

    this.root = root
    this.svg = svg
    this.bodyGroup = bodyGroup
    this.outer = outer
    this.inner = inner
    return root
  }

  show() {
    if (!this.root) this.mount()
    if (this.root) this.root.hidden = false
  }

  hide() {
    if (this.root) this.root.hidden = true
  }

  update({
    x,
    y,
    angle = 0,
    sizePx = 20,
    phosphor = 0,
    stretch = 1,
    compression = 0,
    bendDeg = 0,
    crossing = 0,
  }) {
    if (!this.root) this.mount()
    if (!this.root || !this.svg) return

    const p = clamp01(phosphor)
    const cross = clamp01(crossing)
    const size = Math.max(1, sizePx)
    const bounds = CRT_CURSOR_SHAPE.bounds
    const width = (bounds.maxX - bounds.minX) * size
    const height = (bounds.maxY - bounds.minY) * size
    const scaleX = Math.max(0.72, stretch * (1 - clamp01(compression) * 0.16))
    const scaleY = Math.max(0.76, 1 - clamp01(compression) * 0.09)

    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
    this.root.style.transform = `rotate(${angle}rad)`
    this.root.style.opacity = String(1 - cross * 0.11)
    this.root.style.filter = `brightness(${1 - cross * 0.08}) saturate(${1 + p * 0.22}) drop-shadow(0 0 ${0.5 + p * 2.2}px rgba(93,255,145,${0.18 + p * 0.48}))`

    this.svg.style.left = `${bounds.minX * size}px`
    this.svg.style.top = `${bounds.minY * size}px`
    this.svg.style.width = `${width}px`
    this.svg.style.height = `${height}px`
    this.bodyGroup.setAttribute('transform', `scale(${scaleX.toFixed(4)} ${scaleY.toFixed(4)}) skewY(${bendDeg.toFixed(3)})`)

    this.outer.style.fill = mixedRgb([0.96, 0.97, 0.96], CRT_CURSOR_SHAPE.outerColor, p)
    this.outer.style.stroke = mixedRgb([0.06, 0.07, 0.06], [0.12, 0.64, 0.30], p)
    this.inner.style.fill = mixedRgb([0.78, 0.80, 0.79], CRT_CURSOR_SHAPE.innerColor, p)
    this.inner.style.opacity = String(0.22 + p * 0.78)

    this.last = { x, y, angle, sizePx: size, phosphor: p, stretch, compression, bendDeg, crossing: cross }
  }

  destroy() {
    this.root?.remove()
    this.root = this.svg = this.bodyGroup = this.outer = this.inner = null
    this.last = null
  }
}
