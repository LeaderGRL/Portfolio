function finiteNonNegative(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

export function narrationDocumentKey(route, item) {
  const id = item?.id || item?.slug || item?.label || ''
  if (!id) return ''
  return `${String(route || 'document')}:${String(id)}`
}

export class NarrationSession {
  constructor() {
    this.entries = new Map()
  }

  read(documentKey) {
    const key = String(documentKey || '')
    const stored = key ? this.entries.get(key) : null
    if (!stored) {
      return {
        activated: false,
        currentTime: 0,
        duration: 0,
      }
    }
    return { ...stored }
  }

  update(documentKey, patch = {}) {
    const key = String(documentKey || '')
    if (!key) return this.read('')

    const current = this.read(key)
    const next = {
      activated: patch.activated === undefined ? current.activated : Boolean(patch.activated),
      currentTime: patch.currentTime === undefined ? current.currentTime : finiteNonNegative(patch.currentTime),
      duration: patch.duration === undefined ? current.duration : finiteNonNegative(patch.duration),
    }
    this.entries.set(key, next)
    return { ...next }
  }

  resetPosition(documentKey) {
    return this.update(documentKey, { currentTime: 0 })
  }

  clear() {
    this.entries.clear()
  }
}
