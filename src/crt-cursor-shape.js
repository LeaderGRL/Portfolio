const clamp01 = value => Math.max(0, Math.min(1, value))

const freezePoint = (x, y) => Object.freeze([x, y])

export const CRT_CURSOR_SHAPE = Object.freeze({
  textureSize: 64,
  supersample: 4,
  bounds: Object.freeze({ minX: -1.04, maxX: 0.08, minY: -0.44, maxY: 0.44 }),
  points: Object.freeze([
    freezePoint(0, 0),
    freezePoint(-0.43, 0.32),
    freezePoint(-0.39, 0.13),
    freezePoint(-0.94, 0.13),
    freezePoint(-0.94, -0.13),
    freezePoint(-0.39, -0.13),
    freezePoint(-0.43, -0.32),
  ]),
  innerScale: 0.64,
  outerColor: Object.freeze([0.30, 1.0, 0.54]),
  innerColor: Object.freeze([0.88, 1.0, 0.93]),
})

export const DEFAULT_CRT_CURSOR_GPU_STATE = Object.freeze({
  visible: false,
  hotspotUv: Object.freeze({ x: 0.5, y: 0.5 }),
  angle: 0,
  sizePx: 20,
  compression: 0,
  hoverIntensity: 0,
  clickImpulse: 0,
  recompositionStrength: 0,
})

const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback

export function normalizeCrtCursorGpuState(value = {}, fallback = DEFAULT_CRT_CURSOR_GPU_STATE) {
  const fallbackUv = fallback?.hotspotUv || DEFAULT_CRT_CURSOR_GPU_STATE.hotspotUv
  const nextUv = value?.hotspotUv || fallbackUv
  const state = {
    visible: value?.visible == null ? Boolean(fallback?.visible) : Boolean(value.visible),
    hotspotUv: Object.freeze({
      x: finiteOr(nextUv?.x, fallbackUv.x),
      y: finiteOr(nextUv?.y, fallbackUv.y),
    }),
    angle: finiteOr(value?.angle, fallback?.angle ?? 0),
    sizePx: Math.max(1, finiteOr(value?.sizePx, fallback?.sizePx ?? 20)),
    compression: clamp01(finiteOr(value?.compression, fallback?.compression ?? 0)),
    hoverIntensity: clamp01(finiteOr(value?.hoverIntensity, fallback?.hoverIntensity ?? 0)),
    clickImpulse: clamp01(finiteOr(value?.clickImpulse, fallback?.clickImpulse ?? 0)),
    recompositionStrength: clamp01(finiteOr(
      value?.recompositionStrength,
      fallback?.recompositionStrength ?? 0,
    )),
  }
  return Object.freeze(state)
}

function pointInsidePolygon(x, y, scale) {
  const points = CRT_CURSOR_SHAPE.points
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0] * scale
    const yi = points[i][1] * scale
    const xj = points[j][0] * scale
    const yj = points[j][1] * scale
    const crosses = (yi > y) !== (yj > y)
    if (!crosses) continue
    const edgeX = (xj - xi) * (y - yi) / (yj - yi) + xi
    if (x < edgeX) inside = !inside
  }
  return inside
}

export function rasterizeCrtCursorShape() {
  const { textureSize: size, supersample, bounds, innerScale, outerColor, innerColor } = CRT_CURSOR_SHAPE
  const data = new Uint8Array(size * size * 4)
  const samples = supersample * supersample
  const spanX = bounds.maxX - bounds.minX
  const spanY = bounds.maxY - bounds.minY

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let outerHits = 0
      let innerHits = 0
      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const u = (px + (sx + 0.5) / supersample) / size
          const v = (py + (sy + 0.5) / supersample) / size
          const x = bounds.minX + u * spanX
          const y = bounds.minY + v * spanY
          if (pointInsidePolygon(x, y, 1)) outerHits += 1
          if (pointInsidePolygon(x, y, innerScale)) innerHits += 1
        }
      }

      const outerCoverage = outerHits / samples
      if (outerCoverage <= 0) continue
      const innerCoverage = innerHits / samples
      const coreMix = clamp01(innerCoverage / outerCoverage)
      const offset = (py * size + px) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const color = outerColor[channel] + (innerColor[channel] - outerColor[channel]) * coreMix
        data[offset + channel] = Math.round(clamp01(color) * 255)
      }
      data[offset + 3] = Math.round(outerCoverage * 255)
    }
  }

  return data
}
