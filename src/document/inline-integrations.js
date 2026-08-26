import { SRC_H, SRC_W } from '../core.js'

/* ========================================================================== *
 * InlineIntegrationController
 *
 * Cross-origin iframe pixels cannot be sampled by the CRT WebGL shader. They
 * can, however, remain embedded in the physical screen and receive compositor
 * optics without exposing their pixels to JavaScript.
 *
 * Interaction policy:
 * - integrations are visible immediately;
 * - wheel always belongs to the document while the shield is active;
 * - YouTube stays shielded permanently and is controlled through postMessage;
 * - integrations that require direct pointer input can still opt into a short
 *   active state, restored to scroll mode when the pointer leaves.
 * ========================================================================== */
export class InlineIntegrationController {
  constructor({ tube, rasteriser, registry }) {
    this.tube = tube
    this.rasteriser = rasteriser
    this.registry = registry
    this.instances = new Map()
    this.opticsFilterId = 'document-crt-native-optics'
    this.syncing = false
    this.syncQueued = false

    this._ensureOpticsFilter()

    this.layer = document.createElement('div')
    this.layer.className = 'document-inline-integrations'
    this.layer.setAttribute('aria-label', 'Interactive project integrations')
    this.tube?.append(this.layer)
  }

  get isPoweredOn() {
    return !this.tube?.classList.contains('is-powered-off')
  }

  _neutralBarrelMap() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="rgb(128,128,128)"/></svg>'
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  _makeBarrelMap() {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext?.('2d')
    if (!ctx) return this._neutralBarrelMap()

    let image = null
    try {
      image = ctx.createImageData?.(size, size)
    } catch {}
    if (!image?.data || image.data.length < size * size * 4) {
      return this._neutralBarrelMap()
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x / (size - 1) - 0.5) * 2
        const ny = (y / (size - 1) - 0.5) * 2
        const r2 = Math.min(1, (nx * nx + ny * ny) * 0.5)
        const dx = Math.max(-1, Math.min(1, nx * r2))
        const dy = Math.max(-1, Math.min(1, ny * r2))
        const i = (y * size + x) * 4
        image.data[i] = Math.round(128 + dx * 120)
        image.data[i + 1] = Math.round(128 + dy * 120)
        image.data[i + 2] = 128
        image.data[i + 3] = 255
      }
    }

    try {
      ctx.putImageData?.(image, 0, 0)
      const uri = canvas.toDataURL?.('image/png')
      return uri || this._neutralBarrelMap()
    } catch {
      return this._neutralBarrelMap()
    }
  }

  _ensureOpticsFilter() {
    if (document.getElementById(this.opticsFilterId)) return

    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.classList.add('document-inline-optics-defs')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.setAttribute('aria-hidden', 'true')

    const defs = document.createElementNS(ns, 'defs')
    const filter = document.createElementNS(ns, 'filter')
    filter.id = this.opticsFilterId
    filter.setAttribute('x', '-4%')
    filter.setAttribute('y', '-4%')
    filter.setAttribute('width', '108%')
    filter.setAttribute('height', '108%')
    filter.setAttribute('filterUnits', 'objectBoundingBox')
    filter.setAttribute('primitiveUnits', 'objectBoundingBox')
    filter.setAttribute('color-interpolation-filters', 'sRGB')

    const map = document.createElementNS(ns, 'feImage')
    map.setAttribute('href', this._makeBarrelMap())
    map.setAttribute('x', '0')
    map.setAttribute('y', '0')
    map.setAttribute('width', '1')
    map.setAttribute('height', '1')
    map.setAttribute('preserveAspectRatio', 'none')
    map.setAttribute('result', 'barrel-map')

    const displacement = document.createElementNS(ns, 'feDisplacementMap')
    displacement.setAttribute('in', 'SourceGraphic')
    displacement.setAttribute('in2', 'barrel-map')
    displacement.setAttribute('scale', '0.018')
    displacement.setAttribute('xChannelSelector', 'R')
    displacement.setAttribute('yChannelSelector', 'G')
    displacement.setAttribute('result', 'warped')

    const blur = document.createElementNS(ns, 'feGaussianBlur')
    blur.setAttribute('in', 'warped')
    blur.setAttribute('stdDeviation', '0.0012')
    blur.setAttribute('result', 'soft')

    const blend = document.createElementNS(ns, 'feBlend')
    blend.setAttribute('in', 'warped')
    blend.setAttribute('in2', 'soft')
    blend.setAttribute('mode', 'screen')

    filter.append(map, displacement, blur, blend)
    defs.append(filter)
    svg.append(defs)
    document.body.append(svg)
  }

  _key(entry, descriptor) {
    const block = descriptor.block || entry.block || {}
    return [descriptor.provider, block.src || block.uid || block.id || '', entry.y].join(':')
  }

  _isInline(entry, descriptor) {
    if (!entry || !descriptor) return false
    return descriptor.inline === true || entry.type === 'embed' || entry.type === 'model3d' || entry.type === 'video'
  }

  _visibleAmount(entry) {
    const top = entry.y - this.rasteriser.scroll
    const bottom = top + entry.height
    return Math.max(0, Math.min(bottom, SRC_H) - Math.max(top, 0))
  }

  _position(host, entry) {
    const top = entry.y - this.rasteriser.scroll
    host.style.left = `${(entry.x / SRC_W) * 100}%`
    host.style.top = `${(top / SRC_H) * 100}%`
    host.style.width = `${(entry.width / SRC_W) * 100}%`
    host.style.height = `${(entry.height / SRC_H) * 100}%`
  }

  _scrollDocument(deltaY) {
    const reader = this.rasteriser?.reader
    if (!reader) return
    reader.scrollTop += deltaY
  }

  _postYouTube(instance, command) {
    const iframe = instance?.surface?.querySelector('iframe')
    iframe?.contentWindow?.postMessage?.(
      JSON.stringify({ event: 'command', func: command, args: [] }),
      '*',
    )
  }

  _toggleYouTube(instance) {
    instance.youtubePlaying = !instance.youtubePlaying
    this._postYouTube(instance, instance.youtubePlaying ? 'playVideo' : 'pauseVideo')
    instance.host.classList.toggle('is-playing', instance.youtubePlaying)
  }

  _setActive(instance, active) {
    if (!instance || instance.descriptor.direct) return

    if (instance.descriptor.provider === 'youtube') {
      instance.host.classList.remove('is-active')
      instance.shield.hidden = false
      instance.surface.style.pointerEvents = 'none'
      return
    }

    instance.host.classList.toggle('is-active', active)
    instance.shield.hidden = active
    instance.surface.style.pointerEvents = active ? 'auto' : 'none'
  }

  _mount(entry, descriptor) {
    const resolved = this.registry?.resolve?.(descriptor.block)
    if (!resolved) return null

    const host = document.createElement('div')
    host.className = `document-inline-integration document-inline-integration--${resolved.provider}`
    host.dataset.provider = resolved.provider
    this._position(host, entry)

    const surface = document.createElement('div')
    surface.className = 'document-inline-integration__surface'
    surface.style.pointerEvents = descriptor.direct ? 'auto' : 'none'

    const shield = document.createElement('div')
    shield.className = 'document-inline-integration__activation'
    shield.tabIndex = descriptor.direct ? -1 : 0
    shield.hidden = Boolean(descriptor.direct)
    if (!descriptor.direct) {
      shield.setAttribute('role', 'button')
      shield.setAttribute(
        'aria-label',
        resolved.provider === 'youtube'
          ? 'Play or pause embedded video; use the wheel to scroll the document'
          : 'Activate embedded integration',
      )
    }

    host.append(surface, shield)
    this.layer.append(host)

    const cleanup = resolved.adapter.mount({
      block: descriptor.block,
      host: surface,
      context: { mode: 'inline', entry, rasteriser: this.rasteriser },
    })

    const instance = {
      host,
      surface,
      shield,
      cleanup: typeof cleanup === 'function' ? cleanup : null,
      entry,
      descriptor,
      youtubePlaying: false,
    }

    const relayWheel = event => {
      event.preventDefault()
      event.stopPropagation()
      this._scrollDocument(event.deltaY)
    }
    shield.addEventListener('wheel', relayWheel, { passive: false })
    if (descriptor.direct) surface.addEventListener('wheel', relayWheel, { passive: false })

    if (!descriptor.direct) {
      shield.addEventListener('click', () => {
        if (descriptor.provider === 'youtube') this._toggleYouTube(instance)
        else this._setActive(instance, true)
      })
      shield.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        if (descriptor.provider === 'youtube') this._toggleYouTube(instance)
        else this._setActive(instance, true)
      })
      host.addEventListener('pointerleave', () => this._setActive(instance, false))
    }

    return instance
  }

  _disposeInstance(instance) {
    if (!instance || instance.disposed) return
    instance.disposed = true
    instance.host.remove()
    try {
      instance.cleanup?.()
    } catch (error) {
      console.warn('Inline integration cleanup failed', error)
    }
  }

  sync() {
    if (this.syncing) {
      this.syncQueued = true
      return
    }

    this.syncing = true
    try {
      const activeDocument = this.tube?.dataset.displayMode === 'article'
      if (!this.isPoweredOn || !activeDocument) {
        this.clear()
        this.layer.hidden = true
        return
      }

      this.layer.hidden = false
      const wanted = new Set()

      for (const entry of this.rasteriser?.layout || []) {
        if (this._visibleAmount(entry) < 2) continue
        const descriptor = this.rasteriser.getInteraction?.(entry)
        if (!this._isInline(entry, descriptor)) continue

        const key = this._key(entry, descriptor)
        wanted.add(key)
        let instance = this.instances.get(key)
        if (!instance) {
          instance = this._mount(entry, descriptor)
          if (!instance) continue
          this.instances.set(key, instance)
        }
        instance.entry = entry
        this._position(instance.host, entry)
      }

      for (const [key, instance] of [...this.instances]) {
        if (wanted.has(key)) continue
        this.instances.delete(key)
        this._disposeInstance(instance)
      }
    } finally {
      this.syncing = false
      if (this.syncQueued) {
        this.syncQueued = false
        queueMicrotask(() => this.sync())
      }
    }
  }

  clear() {
    const instances = [...this.instances.values()]
    this.instances.clear()
    for (const instance of instances) this._disposeInstance(instance)
  }

  destroy() {
    this.clear()
    this.layer.remove()
  }
}
