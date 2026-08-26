import { assertBlockType } from './schema.js'

/* ========================================================================== *
 * BlockRegistry
 *
 * Runtime behavior is registered by capability, never by project id. A block
 * handler may implement any subset of the following hooks:
 *
 * - measure(ctx, block, env) -> layout metrics
 * - paint(ctx, block, layout, env)
 * - getInteraction(block, layout, env) -> interaction descriptor | null
 * - preload(block, env)
 * - dispose(block, env)
 *
 * The first renderer can remain simple while this contract lets richer blocks
 * grow without expanding a central switch statement indefinitely.
 * ========================================================================== */
export class BlockRegistry {
  constructor(entries = []) {
    this.handlers = new Map()
    for (const [type, handler] of entries) this.register(type, handler)
  }

  register(type, handler) {
    assertBlockType(type, 'BlockRegistry')
    if (!handler || typeof handler !== 'object') {
      throw new TypeError(`BlockRegistry: handler for "${type}" must be an object`)
    }
    this.handlers.set(type, handler)
    return this
  }

  unregister(type) {
    return this.handlers.delete(type)
  }

  has(type) {
    return this.handlers.has(type)
  }

  get(type) {
    return this.handlers.get(type) || null
  }

  require(type) {
    const handler = this.get(type)
    if (!handler) throw new Error(`BlockRegistry: no runtime handler registered for "${type}"`)
    return handler
  }

  entries() {
    return this.handlers.entries()
  }
}
