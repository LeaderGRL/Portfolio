/* Visible keyboard-focus proxy for the transparent semantic document mirror.
 *
 * Article semantics live in a native DOM layer so assistive technology and
 * browser controls remain usable, while visible pixels are rasterised through
 * the CRT pipeline. This module projects focus from that transparent DOM layer
 * back onto the physical tube so keyboard users never focus an invisible link.
 */

const FOCUSABLE = 'a[href], button, input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])'
// Keep one physical CSS pixel of headroom. Exact 24px targets can round down
// after the machine's transform matrix (for example to 23.9908px in Chromium).
const MIN_PHYSICAL_TARGET = 25

function labelFor(node) {
  return node.getAttribute('aria-label')
    || node.getAttribute('title')
    || node.textContent?.trim()
    || node.tagName.toLowerCase()
}

export function installSemanticFocusProxy() {
  const reader = document.getElementById('article-reader')
  const tube = document.getElementById('tube')
  if (!reader || !tube || tube.querySelector('.semantic-focus-proxy')) return null

  const proxy = document.createElement('div')
  proxy.className = 'semantic-focus-proxy'
  proxy.hidden = true
  proxy.setAttribute('aria-hidden', 'true')
  tube.append(proxy)

  let focused = null

  const sync = () => {
    if (!focused || reader.hidden || !reader.contains(focused)) {
      proxy.hidden = true
      return
    }

    const tubeRect = tube.getBoundingClientRect()
    const rect = focused.getBoundingClientRect()
    const localWidth = tube.offsetWidth
    const localHeight = tube.offsetHeight
    if (!tubeRect.width || !tubeRect.height || !localWidth || !localHeight || !rect.width || !rect.height) {
      proxy.hidden = true
      return
    }

    // Bounding rectangles are post-transform physical CSS pixels. The proxy is
    // positioned in the tube's pre-transform local coordinate system, so all
    // geometry must be converted back before CSS applies the machine scale.
    const scaleX = tubeRect.width / localWidth
    const scaleY = tubeRect.height / localHeight
    if (!scaleX || !scaleY) {
      proxy.hidden = true
      return
    }

    const physicalLeft = Math.max(0, rect.left - tubeRect.left)
    const physicalTop = Math.max(0, rect.top - tubeRect.top)
    const physicalRight = Math.min(tubeRect.width, rect.right - tubeRect.left)
    const physicalBottom = Math.min(tubeRect.height, rect.bottom - tubeRect.top)

    if (physicalRight <= 0 || physicalBottom <= 0 || physicalLeft >= tubeRect.width || physicalTop >= tubeRect.height) {
      proxy.hidden = true
      return
    }

    proxy.style.left = `${physicalLeft / scaleX}px`
    proxy.style.top = `${physicalTop / scaleY}px`
    proxy.style.width = `${Math.max(MIN_PHYSICAL_TARGET / scaleX, (physicalRight - physicalLeft) / scaleX)}px`
    proxy.style.height = `${Math.max(MIN_PHYSICAL_TARGET / scaleY, (physicalBottom - physicalTop) / scaleY)}px`
    proxy.dataset.label = labelFor(focused).slice(0, 80)
    proxy.classList.toggle('is-label-inside', physicalTop < 28)
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
