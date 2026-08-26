import { IntegrationRegistry } from './integration-registry.js'

function iframeAdapter(resolveSrc) {
  return {
    mount({ block, host }) {
      const iframe = document.createElement('iframe')
      iframe.className = 'article-interaction__embed'
      iframe.src = resolveSrc(block)
      iframe.title = block.title || block.label || 'Interactive integration'
      iframe.loading = 'lazy'
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation')
      iframe.setAttribute('allow', 'autoplay; clipboard-read; clipboard-write; fullscreen; gamepad')
      iframe.allowFullscreen = true
      host.append(iframe)
      return () => iframe.remove()
    },
  }
}

function gistAdapter() {
  return {
    canHandle(block) {
      try {
        const url = new URL(block.src)
        return url.protocol === 'https:' && url.hostname === 'gist.github.com' && url.pathname.endsWith('.js')
      } catch {
        return false
      }
    },
    mount({ block, host }) {
      const iframe = document.createElement('iframe')
      iframe.className = 'article-interaction__embed article-interaction__embed--gist'
      iframe.title = block.title || block.label || 'GitHub Gist'
      iframe.loading = 'lazy'
      iframe.referrerPolicy = 'no-referrer'
      iframe.setAttribute('sandbox', 'allow-scripts allow-popups')

      // Gist embeds are script-based rather than normal iframe endpoints. Keep
      // that script inside its own sandboxed document so the main portfolio
      // never executes third-party code in the parent page.
      const scriptSrc = String(block.src || '')
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
      iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;overflow:auto}body{font:12px ui-monospace,SFMono-Regular,Consolas,monospace}.gist{margin:0!important}</style></head><body><script src="${scriptSrc}"><\/script></body></html>`
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

function mediaSingleAdapter(viewer) {
  return {
    mount({ block, host }) {
      if (!block.src) return null
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'document-media-hotspot'
      button.setAttribute('aria-label', block.label ? `Open ${block.label}` : 'Open document image')
      button.style.inset = '0'
      button.addEventListener('click', () => viewer.open([{ src: block.src, label: block.label || '' }], 0))
      host.append(button)
      return () => button.remove()
    },
  }
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
        button.setAttribute('aria-label', item.label ? `Open ${item.label}` : 'Open document image')

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

function localVideoAdapter() {
  return {
    mount({ host, context }) {
      const entry = context?.entry
      const rasteriser = context?.rasteriser
      const video = rasteriser?.videoNodes?.[entry?.videoIndex]
      if (!video) return null

      // Video elements start with preload="none" so a long document does not
      // fetch every MP4 during construction. This adapter is mounted only while
      // the corresponding block is visible, which is the right first-frame boundary.
      if (video.preload === 'none' && video.readyState < 2) {
        video.preload = 'auto'
        try { video.load() } catch {}
      }

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'document-media-hotspot document-video-hotspot'
      button.style.inset = '0'
      button.setAttribute('aria-label', 'Play or pause local document video')

      const toggle = async () => {
        if (video.paused || video.ended) {
          try { await video.play() } catch {}
        } else {
          video.pause()
        }
        rasteriser.markDirty()
      }

      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        toggle()
      })
      button.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        toggle()
      })

      host.append(button)
      return () => button.remove()
    },
  }
}

export function createDefaultIntegrationRegistry({ local3d, mediaViewer }) {
  const registry = new IntegrationRegistry()

  registry.register('local-3d', {
    mount({ block, host, context }) {
      return local3d.mount(block, host, context)
    },
  })

  registry.register('video', localVideoAdapter())
  registry.register('media-single', mediaSingleAdapter(mediaViewer))
  registry.register('media-gallery', mediaGalleryAdapter(mediaViewer))
  registry.register('media-compare', mediaCompareAdapter(mediaViewer))
  registry.register('iframe', iframeAdapter(block => block.src))
  registry.register('gist', gistAdapter())
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
