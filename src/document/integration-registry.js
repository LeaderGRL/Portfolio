import { normalizeProvider } from './schema.js'

/* ========================================================================== *
 * IntegrationRegistry
 *
 * Provider-specific native integrations live behind adapters. Project content
 * never imports Sketchfab, YouTube, Miro or Google APIs directly.
 *
 * Adapter contract:
 * - canHandle(block) -> boolean (optional)
 * - mount({ block, host, context })
 * - unmount({ host, context }) (optional)
 * ========================================================================== */
export class IntegrationRegistry {
  constructor() {
    this.adapters = new Map()
  }

  register(provider, adapter) {
    const key = String(provider || '').toLowerCase()
    if (!key) throw new Error('IntegrationRegistry: provider is required')
    if (!adapter || typeof adapter.mount !== 'function') {
      throw new TypeError(`IntegrationRegistry: adapter "${key}" must implement mount()`)
    }
    this.adapters.set(key, adapter)
    return this
  }

  unregister(provider) {
    return this.adapters.delete(String(provider || '').toLowerCase())
  }

  get(provider) {
    return this.adapters.get(String(provider || '').toLowerCase()) || null
  }

  resolve(block) {
    const provider = normalizeProvider(block)
    const adapter = this.get(provider)
    if (!adapter) return null
    if (adapter.canHandle && !adapter.canHandle(block)) return null
    return { provider, adapter }
  }

  require(block) {
    const resolved = this.resolve(block)
    if (!resolved) {
      throw new Error(`IntegrationRegistry: no adapter registered for "${normalizeProvider(block)}"`)
    }
    return resolved
  }
}
