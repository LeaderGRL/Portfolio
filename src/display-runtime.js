import { DisplayCompositor } from './display-compositor.js'

let compositor = null
let observer = null
let raf = 0
let lastTime = 0

function inferMode(tube) {
  if (tube.classList.contains('is-reading')) return 'article'
  return 'terminal'
}

export function initDisplayRuntime() {
  if (compositor) return compositor

  const tube = document.getElementById('tube')
  const surfaceRoot = document.getElementById('display-surface')
  const overlayCanvas = document.getElementById('crt-overlay')
  if (!tube || !surfaceRoot || !overlayCanvas) return null

  compositor = new DisplayCompositor({ tube, surfaceRoot, overlayCanvas })

  const sync = () => {
    compositor.setMode(inferMode(tube))
    compositor.setCRTEnabled(!tube.classList.contains('is-crt-off'))
    compositor.setPowered(!tube.classList.contains('is-powered-off'))
    compositor.resize(Math.min(devicePixelRatio || 1, 1.5))
  }

  observer = new MutationObserver(sync)
  observer.observe(tube, { attributes: true, attributeFilter: ['class', 'data-display-mode'] })
  addEventListener('resize', sync)
  document.addEventListener('fullscreenchange', sync)
  sync()

  const frame = (ms) => {
    raf = requestAnimationFrame(frame)
    const time = ms / 1000
    const dt = Math.min(0.05, time - (lastTime || time))
    lastTime = time
    compositor.render(time, dt)
  }
  raf = requestAnimationFrame(frame)

  return compositor
}

export function getDisplayCompositor() {
  return compositor
}

export function destroyDisplayRuntime() {
  if (raf) cancelAnimationFrame(raf)
  observer?.disconnect()
  compositor = null
  observer = null
  raf = 0
  lastTime = 0
}
