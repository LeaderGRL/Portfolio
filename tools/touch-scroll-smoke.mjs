import { installTouchScroll } from '../src/document/touch-scroll.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(62)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map()
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || []
    this.listeners.set(type, listeners.filter(candidate => candidate !== listener))
  }

  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event)
  }
}

class FakeStyle {
  constructor() {
    this.values = new Map()
  }

  getPropertyValue(name) {
    return this.values.get(name) || ''
  }

  setProperty(name, value) {
    this.values.set(name, String(value))
  }

  removeProperty(name) {
    this.values.delete(name)
  }
}

const pointer = (pointerId, clientY, overrides = {}) => ({
  pointerId,
  clientY,
  pointerType: 'touch',
  button: 0,
  preventDefault() {},
  stopPropagation() {},
  ...overrides,
})

const root = new FakeEventTarget()
const target = new FakeEventTarget()
target.style = new FakeStyle()
target.ownerDocument = { defaultView: root }

const reader = {
  scrollTop: 0,
  offsetHeight: 100,
  clientHeight: 100,
  getBoundingClientRect: () => ({ height: 50 }),
}

const cleanup = installTouchScroll(target, { rasteriser: { reader } })
check(target.style.getPropertyValue('touch-action') === 'pinch-zoom', 'media keeps browser pinch zoom enabled')

target.dispatch('pointerdown', pointer(1, 100))
root.dispatch('pointermove', pointer(1, 80))
check(reader.scrollTop === 40, 'pointer delta is converted from rendered to reader space')

cleanup()
root.dispatch('pointermove', pointer(1, 60))
check(reader.scrollTop === 80, 'active swipe survives media node cleanup')
root.dispatch('pointerup', pointer(1, 60))
check((root.listeners.get('pointermove') || []).length === 0, 'global gesture listeners leave after pointer end')
check(target.style.getPropertyValue('touch-action') === '', 'cleanup restores the previous touch-action')

const secondTarget = new FakeEventTarget()
secondTarget.style = new FakeStyle()
secondTarget.ownerDocument = { defaultView: root }
reader.scrollTop = 0
const cleanupSecond = installTouchScroll(secondTarget, { rasteriser: { reader } })
secondTarget.dispatch('pointerdown', pointer(10, 100))
root.dispatch('pointerdown', pointer(11, 100))
root.dispatch('pointermove', pointer(10, 50))
check(reader.scrollTop === 0, 'second touch cancels manual scrolling for pinch zoom')
cleanupSecond()

console.log(failed ? `\n  ${failed} touch-scroll check(s) FAILED` : '\n  all touch-scroll checks passed')
process.exit(failed ? 1 : 0)
