/* Visible keyboard-focus proxy for the transparent semantic document mirror.
 *
 * Article semantics live in a native DOM layer so assistive technology and
 * browser controls remain usable, while visible pixels are rasterised through
 * the CRT pipeline. This module projects focus from that transparent DOM layer
 * back onto the physical tube so keyboard users never focus an invisible link.
 */

const FOCUSABLE = 'a[href], button, input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])'

function labelFor(node) {
  return node.getAttribute('aria-label')
    || node.getAttribute('title')
    || node.textContent?.trim()
    || node.tagName.toLowerCase()
}

export function installSemanticFocusProxy() {
  const reader = document.getElementById('article-reader')
  const surface = document.getElementById('display-surface')
  const tube = document.getElementById('tube')
  if (!reader || !surface || !tube || tube.querySelector('.semantic-focus-proxy')) return null

  const proxy = document.createElement('div')
  proxy.className = 'semantic-focus-proxy'
  proxy.hidden = true
  proxy.setAttribute('aria-hidden', 'true')

  // The semantic surface is intentionally opacity:0 while article pixels are
  // displayed through the CRT. The proxy must therefore be a sibling of that
  // surface, not its child, otherwise it would inherit the same invisibility.
  tube.append(proxy)

  let focused = null

  const sync = () => {
    if (!focused || reader.hidden || !reader.contains(focused)) {
      proxy.hidden = true
      return
    }

    const surfaceRect = surface.getBoundingClientRect()
    const rect = focused.getBoundingClientRect()
    if (!surfaceRect.width || !surfaceRect.height || !rect.width || !rect.height) {
      proxy.hidden = true
      return
    }

    const left = Math.max(0, rect.left - surfaceRect.left)
    const top = Math.max(0, rect.top - surfaceRect.top)
    const right = Math.min(surfaceRect.width, rect.right - surfaceRect.left)
    const bottom = Math.min(surfaceRect.height, rect.bottom - surfaceRect.top)

    if (right <= 0 || bottom <= 0 || left >= surfaceRect.width || top >= surfaceRect.height) {
      proxy.hidden = true
      return
    }

    proxy.style.left = `${left}px`
    proxy.style.top = `${top}px`
    proxy.style.width = `${Math.max(24, right - left)}px`
    proxy.style.height = `${Math.max(24, bottom - top)}px`
    proxy.dataset.label = labelFor(focused).slice(0, 80)
    proxy.classList.toggle('is-label-inside', top < 28)
    proxy.hidden = false
  }

  reader.addEventListener('focusin', event => {
    const target = event.target instanceof Element ? event.target.closest(FOCUSABLE) : null
    if (!target || !reader.contains(target)) return
    focused = target
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    requestAnimationFrame(sync)
  })

  reader.addEventListener('focusout', event => {
    const next = event.relatedTarget
    if (next instanceof Node && reader.contains(next)) return
    focused = null
    proxy.hidden = true
  })

  reader.addEventListener('scroll', () => {
    if (focused) requestAnimationFrame(sync)
  }, { passive: true })

  addEventListener('resize', sync)

  return { sync }
}
