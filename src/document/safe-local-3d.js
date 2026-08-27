import { Local3DManager } from './local-3d.js'

/* ========================================================================== *
 * SafeLocal3DManager
 *
 * Three.js WebGLRenderer creation can throw when WebGL2 is unavailable. The
 * document runtime must treat that exactly like an asset load failure instead
 * of letting an optional 3D block abort the whole document.
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

export class SafeLocal3DManager extends Local3DManager {
  constructor(onDirty = () => {}) {
    super(onDirty)
    this.failedScenes = new Map()
  }

  ensure(block) {
    const key = this.key(block)
    if (!key) return null

    const failed = this.failedScenes.get(key)
    if (failed) return failed

    try {
      return super.ensure(block)
    } catch (error) {
      const scene = failedScene(error)
      this.failedScenes.set(key, scene)
      console.warn('Local 3D renderer unavailable; using document fallback', error)
      this.onDirty()
      return scene
    }
  }

  tick(block, time) {
    if (this.failedScenes.has(this.key(block))) return false
    return super.tick(block, time)
  }

  mount(block, host, context) {
    if (this.failedScenes.has(this.key(block))) return null
    try {
      return super.mount(block, host, context)
    } catch (error) {
      const key = this.key(block)
      const scene = failedScene(error)
      this.failedScenes.set(key, scene)
      console.warn('Local 3D interaction unavailable; using document fallback', error)
      this.onDirty()
      return null
    }
  }

  dispose() {
    super.dispose()
    this.failedScenes.clear()
  }
}
