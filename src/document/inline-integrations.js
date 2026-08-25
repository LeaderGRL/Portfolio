import { SRC_H, SRC_W } from '../core.js'

/* ========================================================================== *
 * InlineIntegrationController
 *
 * Cross-origin iframe pixels cannot be sampled by the CRT WebGL shader. Instead
 * of hiding those integrations behind a modal/button, mount them directly in
 * the document at the exact raster block coordinates. The layer sits above the
 * electronic picture and below the photographic glass, so the integration feels
 * physically embedded in the JG-1500 while remaining fully interactive.
 *
 * Local 3D uses the same contract: its mounted canvas is only an input proxy;
 * the visible Three.js pixels still come from the raster -> FRAG_CRT path.
 * ========================================================================== */
export class InlineIntegrationController {
  constructor({ tube, rasteriser, registry }) {
    this.tube = tube
    this.rasteriser = rasteriser
    this.registry = registry
    this.instances = new Map()

    this.layer = document.createElement('div')
    this.layer.className = 'document-inline-integrations'
    this.layer.setAttribute('aria-label', 'Interactive project integrations')
    this.tube?.append(this.layer)
  }

  get isPoweredOn() {
    return !this.tube?.classList.contains('is-powered-off')
  }

  _key(entry, descriptor) {
    const block = descriptor.block || entry.block || {}
    return [
      descriptor.provider,
      block.src || block.uid || block.id || '',
      entry.y,
    ].join(':')
  }

  _isInline(entry, descriptor) {
    if (!entry || !descriptor) return false
    // Native video controls keep their explicit interaction flow for now.
    if (descriptor.provider === 'video') return false
    return entry.type === 'embed' || entry.type === 'model3d'
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

  _mount(entry, descriptor) {
    const resolved = this.registry?.resolve?.(descriptor.block)
    if (!resolved) return null

    const host = document.createElement('div')
    host.className = `document-inline-integration document-inline-integration--${resolved.provider}`
    host.dataset.provider = resolved.provider
    this._position(host, entry)
    this.layer.append(host)

    const cleanup = resolved.adapter.mount({
      block: descriptor.block,
      host,
      context: { mode: 'inline', entry, rasteriser: this.rasteriser },
    })

    return { host, cleanup: typeof cleanup === 'function' ? cleanup : null, entry, descriptor }
  }

  sync() {
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

    for (const [key, instance] of this.instances) {
      if (wanted.has(key)) continue
      instance.cleanup?.()
      instance.host.remove()
      this.instances.delete(key)
    }
  }

  clear() {
    for (const instance of this.instances.values()) {
      instance.cleanup?.()
      instance.host.remove()
    }
    this.instances.clear()
  }

  destroy() {
    this.clear()
    this.layer.remove()
  }
}
