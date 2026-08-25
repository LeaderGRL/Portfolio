import { IntegrationRegistry } from './integration-registry.js'

function iframeAdapter(resolveSrc) {
  return {
    mount({ block, host }) {
      const iframe = document.createElement('iframe')
      iframe.className = 'article-interaction__embed'
      iframe.src = resolveSrc(block)
      iframe.title = block.title || block.label || 'Interactive integration'
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation')
      iframe.setAttribute('allow', 'autoplay; clipboard-read; clipboard-write; fullscreen; gamepad')
      iframe.allowFullscreen = true
      host.append(iframe)
      return () => iframe.remove()
    },
  }
}

export function createDefaultIntegrationRegistry({ local3d }) {
  const registry = new IntegrationRegistry()

  registry.register('local-3d', {
    mount({ block, host }) {
      // Local 3D is already labelled inside the raster source. The DOM layer is
      // input-only so it must never add visible controls above the CRT picture.
      return local3d.mount(block, host)
    },
  })

  registry.register('iframe', iframeAdapter(block => block.src))
  registry.register('youtube', iframeAdapter(block => {
    if (block.src) return block.src
    const id = block.id || block.uid || ''
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&enablejsapi=1&playsinline=1`
  }))
  registry.register('sketchfab', iframeAdapter(block => {
    if (block.src) return block.src
    const uid = block.uid || block.id || ''
    return `https://sketchfab.com/models/${encodeURIComponent(uid)}/embed?autostart=1&ui_hint=0&ui_infos=0&scrollwheel=0`
  }))
  registry.register('miro', iframeAdapter(block => block.src))
  registry.register('google', iframeAdapter(block => block.src))

  return registry
}
