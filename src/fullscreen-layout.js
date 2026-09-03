import { SRC_W, SRC_H, clamp } from './core.js'

// One geometry contract for the framebuffer, document layout and hit targets.
// Fullscreen changes resolution, not the aspect of images or individual glyphs.
export function fullscreenLayout(width, height, dpr = 1, controlsHeight = 0, maxDimension = 4096) {
  width = Math.max(1, width)
  height = Math.max(1, height)
  const limit = Math.max(1, Math.min(4096, maxDimension))
  const density = Math.min(Math.max(1, dpr), 2, limit / Math.max(width, height), Math.sqrt(8388608 / (width * height)))
  const textScale = clamp(width / 720, 1.5, 2)
  const bottom = Math.min(height * .35, Math.max(44, controlsHeight + 12))
  const scale = Math.min(width / SRC_W, (height - bottom) / SRC_H)
  const terminal = {
    x: (width - SRC_W * scale) / 2,
    y: (height - bottom - SRC_H * scale) / 2,
    width: SRC_W * scale,
    height: SRC_H * scale,
  }
  return {
    width, height, textScale, bottom, terminal,
    pixelWidth: Math.max(1, Math.floor(width * density)),
    pixelHeight: Math.max(1, Math.floor(height * density)),
    documentWidth: width / textScale,
    documentHeight: height / textScale,
    documentBottom: bottom / textScale,
  }
}
