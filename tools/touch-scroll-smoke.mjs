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
  defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true },
  stopPropagation() {},
  stopImmediatePropagation() {},
  ...overrides,
})

const root = new FakeEventTarget()
const makeTarget = () => {
  const target = new FakeEventTarget()
  target.style = new FakeStyle()
  target.ownerDocument = { defaultView: root }
  return target
}

const reader = {
  scrollTop: 0,
  offsetHeight: 100,
  clientHeight: 100,
  getBoundingClientRect: () => ({ height: 50 }),
}

const target = makeTarget()
const cleanup = installTouchScroll(target, { rasteriser: { reader } })
check(target.style.getPropertyValue('touch-action') === 'pinch-zoom', 'media keeps browser pinch zoom enabled')

root.dispatch('pointerdown', pointer(1, 100))
target.dispatch('pointerdown', pointer(1, 100))
root.dispatch('pointermove', pointer(1, 80))
check(reader.scrollTop === 40, 'pointer delta is converted from rendered to reader space')

cleanup()
root.dispatch('pointermove', pointer(1, 60))
check(reader.scrollTop === 80, 'active swipe survives media node cleanup')
root.dispatch('pointerup', pointer(1, 60))
check((root.listeners.get('pointermove') || []).length === 0, 'global gesture listeners leave after pointer end')
check(target.style.getPropertyValue('touch-action') === '', 'cleanup restores the previous touch-action')

const secondTarget = makeTarget()
reader.scrollTop = 0
const cleanupSecond = installTouchScroll(secondTarget, { rasteriser: { reader } })

root.dispatch('pointerdown', pointer(10, 100))
secondTarget.dispatch('pointerdown', pointer(10, 100))
const secondContact = pointer(11, 100)
root.dispatch('pointerdown', secondContact)
secondTarget.dispatch('pointerdown', secondContact)
root.dispatch('pointermove', pointer(11, 50))
root.dispatch('pointermove', pointer(10, 50))
check(reader.scrollTop === 0, 'second touch cannot restart manual scrolling during pinch')
root.dispatch('pointerup', pointer(11, 50))
root.dispatch('pointerup', pointer(10, 50))

root.dispatch('pointerdown', pointer(12, 100))
secondTarget.dispatch('pointerdown', pointer(12, 100))
root.dispatch('pointermove', pointer(12, 70))
root.dispatch('pointerup', pointer(12, 70))
const draggedClick = pointer(12, 70)
secondTarget.dispatch('click', draggedClick)
check(draggedClick.defaultPrevented, 'drag synthetic click is suppressed')

root.dispatch('pointerdown', pointer(13, 100))
secondTarget.dispatch('pointerdown', pointer(13, 100))
root.dispatch('pointerup', pointer(13, 100))
const quickTapClick = pointer(13, 100)
secondTarget.dispatch('click', quickTapClick)
check(!quickTapClick.defaultPrevented, 'new tap clears stale drag click suppression')

const galleryTargetA = makeTarget()
const galleryTargetB = makeTarget()
reader.scrollTop = 0
const cleanupGalleryA = installTouchScroll(galleryTargetA, { rasteriser: { reader } })
const cleanupGalleryB = installTouchScroll(galleryTargetB, { rasteriser: { reader } })

root.dispatch('pointerdown', pointer(20, 100))
galleryTargetA.dispatch('pointerdown', pointer(20, 100))
root.dispatch('pointerdown', pointer(21, 100))
galleryTargetB.dispatch('pointerdown', pointer(21, 100))
root.dispatch('pointermove', pointer(21, 40))
root.dispatch('pointermove', pointer(20, 40))
check(reader.scrollTop === 0, 'pinch across separate media hotspots never starts manual scroll')
root.dispatch('pointerup', pointer(21, 40))
root.dispatch('pointerup', pointer(20, 40))

cleanupGalleryA()
cleanupGalleryB()
cleanupSecond()

console.log(failed ? `\n  ${failed} touch-scroll check(s) FAILED` : '\n  all touch-scroll checks passed')
process.exit(failed ? 1 : 0)
