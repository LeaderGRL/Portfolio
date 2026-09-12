import { SRC_W, SRC_H, clamp } from './core.js'
import { displayLayout } from './layout-engine.js'

// One geometry contract for the framebuffer, document layout and hit targets.
// Fullscreen changes resolution, not the aspect of images or individual glyphs.
export function fullscreenLayout(width, height, dpr = 1, controlsHeight = 0, maxDimension = 4096) {
  width = Math.max(1, width)
  height = Math.max(1, height)
  const textScale = clamp(width / 720, 1.5, 2)
  // Wrapped touch controls and safe-area padding can occupy more than 35% of
  // a short landscape viewport. Reserve their actual height before fitting
  // either the terminal or documents, so navigation never covers content.
  const bottom = Math.min(Math.max(0, height - 1), Math.max(44, controlsHeight + 12))
  return displayLayout({
    width,
    height,
    sourceWidth: SRC_W,
    sourceHeight: SRC_H,
    bottom,
    textScale,
    dpr,
    maxDimension,
  })
}
