/* ========================================================================== *
 * SafeLocal3DManager
 *
 * Local 3D is optional content, so its Three.js dependency is loaded only when
 * a model block actually asks for it. Renderer creation can still throw when
 * WebGL2 is unavailable; the document runtime must treat that exactly like an
 * asset load failure instead of aborting the whole document.
 * ========================================================================== */

const failedScene = error => ({
  ready: false,
  failed: true,
  canvas: null,
  error,
  tick: () => false,
  mountInput: () => {},
  unmountInput: () => {},
  dispose: () => {},
})

export class SafeLocal3DManager {
  constructor(onDirty = () => {}) {
    this.onDirty = onDirty
    this.manager = null
    this.loadPromise = null
    this.loadError = null
    this.failedScenes = new Map()
    this.disposed = false
  }

  key(block) {
    return String(block?.src || block?.uid || block?.id || '')
  }

  _loadManager() {
    if (this.manager) return Promise.resolve(this.manager)
    if (this.loadError || this.disposed) return Promise.resolve(null)
    if (this.loadPromise) return this.loadPromise

    this.loadPromise = import('./local-3d.js')
      .then(({ Local3DManager }) => {
        if (this.disposed) return null
        this.manager = new Local3DManager(this.onDirty)
        this.onDirty()
        return this.manager
      })
      .catch(error => {
        this.loadError = error
        console.warn('Local 3D runtime unavailable; using document fallback', error)
        this.onDirty()
        return null
      })

    return this.loadPromise
  }

  _markFailed(block, error, message) {
    const key = this.key(block)
    const scene = failedScene(error)
    if (key) this.failedScenes.set(key, scene)
    console.warn(message, error)
    this.onDirty()
    return scene
  }

  _ensureLoaded(block) {
    const key = this.key(block)
    if (!key) return null

    const failed = this.failedScenes.get(key)
    if (failed) return failed
    if (this.loadError) return failedScene(this.loadError)

    if (!this.manager) {
      this._loadManager()
      return null
    }

    try {
      return this.manager.ensure(block)
    } catch (error) {
      return this._markFailed(block, error, 'Local 3D renderer unavailable; using document fallback')
    }
  }

  ensure(block) {
    return this._ensureLoaded(block)
  }

  getCanvas(block) {
    return this._ensureLoaded(block)?.canvas || null
  }

  isReady(block) {
    return Boolean(this._ensureLoaded(block)?.ready)
  }

  hasFailed(block) {
    if (this.loadError) return true
    return Boolean(this._ensureLoaded(block)?.failed)
  }

  tick(block, time) {
    if (this.failedScenes.has(this.key(block))) return false
    if (!this.manager) {
      this._loadManager()
      return false
    }
    return this.manager.tick(block, time)
  }

  mount(block, host, context) {
    if (this.failedScenes.has(this.key(block))) return null

    let cancelled = false
    let cleanup = null

    const mountLoaded = manager => {
      if (!manager || cancelled || this.disposed || this.failedScenes.has(this.key(block))) return
      try {
        cleanup = manager.mount(block, host, context)
      } catch (error) {
        this._markFailed(block, error, 'Local 3D interaction unavailable; using document fallback')
      }
    }

    if (this.manager) mountLoaded(this.manager)
    else this._loadManager().then(mountLoaded)

    return () => {
      cancelled = true
      cleanup?.()
    }
  }

  dispose() {
    this.disposed = true
    this.manager?.dispose()
    this.manager = null
    this.failedScenes.clear()
  }
}
