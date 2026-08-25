/* ==========================================================================
 * MEDIA — images and video, pushed through the phosphor
 *
 * A photograph pasted onto this screen in full colour would look like a
 * photograph pasted onto this screen. The tube has four usable levels of
 * green and a visible line structure; anything that appears on it has to be
 * quantised to that, or it reads as a different object sitting in front of
 * the picture rather than as something the machine is displaying.
 *
 * So media is dithered down to the same ramp the text uses, at the same cell
 * resolution, and then goes through the CRT shader with everything else.
 *
 * ORDERED, NOT ERROR-DIFFUSED
 * Floyd–Steinberg gives a better still frame. It is also unstable between
 * frames: a pixel one level from a threshold flips as the error front shifts,
 * and on video that boils. A Bayer matrix is a fixed function of position, so
 * a pixel that does not change does not flicker — which matters far more here
 * than the slightly finer grain of error diffusion.
 * ======================================================================== */

/** 8x8 Bayer matrix, normalised to 0..1. */
const BAYER = (() => {
  const n = 8, m = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0, mask = n >> 1, xc = x, yc = y
      for (let bit = 0; mask; mask >>= 1, bit += 2) {
        const bx = (xc & mask) ? 1 : 0
        const by = (yc & mask) ? 1 : 0
        v |= ((by * 3) ^ bx) << bit
      }
      m[y * n + x] = v / (n * n)
    }
  }
  return m
})()

/** The tube's usable levels, darkest first. Matches the text ramp. */
export const PHOSPHOR = [
  [3, 16, 9], [22, 96, 54], [47, 208, 109], [150, 255, 190],
]

/**
 * Quantise an ImageData in place to the phosphor ramp.
 * `gain` lifts or drops exposure before quantising, since most source images
 * are far brighter than a tube ever gets.
 */
export function dither(img, gain = 1.0) {
  const { data, width, height } = img
  const levels = PHOSPHOR.length - 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // Rec.601 luma: the source is colour, the destination has one channel.
      const l = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255
      const t = BAYER[(y & 7) * 8 + (x & 7)]
      const v = Math.max(0, Math.min(levels,
        Math.round(l * gain * levels + (t - 0.5) * 1.15)))
      const c = PHOSPHOR[v]
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255
    }
  }
  return img
}

/* --------------------------------------------------------------------------
 * LOADER
 * Media is resolved lazily and cached. A page that references a file it has
 * not finished loading draws a placeholder rather than stalling the frame.
 * ----------------------------------------------------------------------- */
const cache = new Map()

export function getImage(src) {
  let e = cache.get(src)
  if (!e) {
    const img = new Image()
    e = { kind: 'image', el: img, ready: false }
    img.onload = () => { e.ready = true }
    img.onerror = () => { e.failed = true }
    img.src = src
    cache.set(src, e)
  }
  return e
}

export function getVideo(src, loop = true) {
  let e = cache.get(src)
  if (!e) {
    const v = document.createElement('video')
    v.muted = true; v.loop = loop; v.playsInline = true; v.preload = 'auto'
    e = { kind: 'video', el: v, ready: false }
    v.oncanplay = () => { e.ready = true; v.play().catch(() => {}) }
    v.onerror = () => { e.failed = true }
    v.src = src
    cache.set(src, e)
  }
  return e
}

/**
 * Draw a media element into the source raster, letterboxed into the given
 * cell rectangle and quantised on the way in.
 *
 * Dithering happens on a scratch canvas at the destination's own size, not on
 * the full-resolution source: quantising first and scaling afterwards would
 * resample the dither pattern itself into grey mush.
 */
const scratch = document.createElement('canvas')
const sctx = scratch.getContext('2d', { willReadFrequently: true })

export function blit(g, entry, x, y, w, h, gain = 1.0) {
  if (!entry || entry.failed) { placeholder(g, x, y, w, h, 'MEDIA UNAVAILABLE'); return }
  if (!entry.ready) { placeholder(g, x, y, w, h, 'LOADING'); return }

  const el = entry.el
  const sw = el.naturalWidth || el.videoWidth
  const sh = el.naturalHeight || el.videoHeight
  if (!sw || !sh) { placeholder(g, x, y, w, h, 'LOADING'); return }

  const scale = Math.min(w / sw, h / sh)
  const dw = Math.max(1, Math.round(sw * scale))
  const dh = Math.max(1, Math.round(sh * scale))
  const dx = x + ((w - dw) >> 1)
  const dy = y + ((h - dh) >> 1)

  scratch.width = dw; scratch.height = dh
  sctx.drawImage(el, 0, 0, dw, dh)
  const img = sctx.getImageData(0, 0, dw, dh)
  dither(img, gain)
  sctx.putImageData(img, 0, 0)
  g.drawImage(scratch, dx, dy)
}

function placeholder(g, x, y, w, h, label) {
  g.save()
  g.strokeStyle = 'rgba(47,208,109,0.35)'
  g.setLineDash([3, 3])
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  g.setLineDash([])
  g.fillStyle = 'rgba(47,208,109,0.5)'
  g.font = '8px monospace'
  g.fillText(label, x + 6, y + 14)
  g.restore()
}

/** True while anything on screen still needs repainting every frame. */
export function isAnimating(entry) {
  return entry && entry.kind === 'video' && entry.ready && !entry.el.paused
}
