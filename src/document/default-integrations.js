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

function galleryItems(block) {
  return String(block.body || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [src, ...rest] = line.split('|').map(part => part.trim())
      return { src, label: rest.join(' | ') }
    })
    .filter(item => item.src)
}

function mediaGalleryAdapter(viewer) {
  return {
    mount({ block, host }) {
      const items = galleryItems(block)
      const columns = Math.max(1, Math.min(3, Number(block.columns) || 2))
      const rows = Math.max(1, Math.ceil(items.length / columns))

      items.forEach((item, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'document-media-hotspot'
        button.setAttribute('aria-label', item.label ? `Open ${item.label}` : 'Open project image')

        const col = index % columns
        const row = Math.floor(index / columns)
        button.style.left = `${(col / columns) * 100}%`
        button.style.top = `${(row / rows) * 100}%`
        button.style.width = `${100 / columns}%`
        button.style.height = `${100 / rows}%`
        button.addEventListener('click', () => viewer.open(items, index))
        host.append(button)
      })

      return () => host.replaceChildren()
    },
  }
}

function mediaCompareAdapter(viewer) {
  return {
    mount({ block, host }) {
      const items = [
        { src: block.before, label: block.beforeLabel || 'Before' },
        { src: block.after, label: block.afterLabel || 'After' },
      ].filter(item => item.src)

      items.forEach((item, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'document-media-hotspot'
        button.setAttribute('aria-label', `Open ${item.label}`)
        button.style.left = `${index * 50}%`
        button.style.top = '0'
        button.style.width = '50%'
        button.style.height = '100%'
        button.addEventListener('click', () => viewer.open(items, index))
        host.append(button)
      })

      return () => host.replaceChildren()
    },
  }
}

export function createDefaultIntegrationRegistry({ local3d, mediaViewer }) {
  const registry = new IntegrationRegistry()

  registry.register('local-3d', {
    mount({ block, host, context }) {
      // Local 3D is already labelled inside the raster source. The DOM layer is
      // input-only so it must never add visible controls above the CRT picture.
      return local3d.mount(block, host, context)
    },
  })

  registry.register('media-gallery', mediaGalleryAdapter(mediaViewer))
  registry.register('media-compare', mediaCompareAdapter(mediaViewer))
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
