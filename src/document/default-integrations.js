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
      host.closest('.article-interaction')?.classList.add('is-model3d-interaction')
      const cleanupModel = local3d.mount(block, host)

      const help = document.createElement('div')
      help.className = 'article-interaction__model-help'
      help.textContent = 'DRAG ROTATE · WHEEL ZOOM'
      host.append(help)

      return () => {
        cleanupModel?.()
        help.remove()
        host.closest('.article-interaction')?.classList.remove('is-model3d-interaction')
      }
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
