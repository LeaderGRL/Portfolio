import { ICONS } from './icons.js'

const ACTIONS = [
  { label: 'ENTER', icon: ICONS.enter },
  { label: 'BACK', icon: ICONS.back },
]

export function installLandscapeActionKeys() {
  const keys = [...document.querySelectorAll('#action-keys .key')]
  const cleanups = []

  ACTIONS.forEach((action, index) => {
    const key = keys[index]
    const legend = key?.querySelector('.key__legend')
    if (!key || !legend) return

    const previousLabel = legend.getAttribute('data-landscape-label')
    legend.setAttribute('data-landscape-label', action.label)

    const icon = document.createElement('span')
    icon.className = 'key__icon key__icon--action'
    icon.setAttribute('aria-hidden', 'true')
    icon.innerHTML = action.icon
    key.appendChild(icon)

    cleanups.push(() => {
      icon.remove()
      if (previousLabel == null) legend.removeAttribute('data-landscape-label')
      else legend.setAttribute('data-landscape-label', previousLabel)
    })
  })

  return () => {
    for (const cleanup of cleanups.reverse()) cleanup()
  }
}
