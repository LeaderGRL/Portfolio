import fs from 'node:fs'
import { BLOCK_TYPES, DIRECTIVE_TYPES, hasBlockType } from '../src/document/schema.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(62)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const plugin = fs.readFileSync('plugins/content.js', 'utf8')
const design = fs.readFileSync('docs/PROJECT_EXPERIENCE_ENGINE.md', 'utf8')
const authoring = fs.readFileSync('docs/ADDING_PROJECTS.md', 'utf8')
const blockRegistry = fs.readFileSync('src/document/block-registry.js', 'utf8')
const defaultBlocks = fs.readFileSync('src/document/default-blocks.js', 'utf8')
const mediaBlocks = fs.readFileSync('src/document/media-blocks.js', 'utf8')
const integrationRegistry = fs.readFileSync('src/document/integration-registry.js', 'utf8')
const integrations = fs.readFileSync('src/document/default-integrations.js', 'utf8')
const inlineIntegrations = fs.readFileSync('src/document/inline-integrations.js', 'utf8')
const local3d = fs.readFileSync('src/document/local-3d.js', 'utf8')
const mediaViewer = fs.readFileSync('src/document/media-viewer.js', 'utf8')
const progressOverlay = fs.readFileSync('src/document/progress-overlay.js', 'utf8')
const bridge = fs.readFileSync('src/article-crt-bridge.js', 'utf8')
const reader = fs.readFileSync('src/article-reader.js', 'utf8')
const displayCss = fs.readFileSync('src/display.css', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const penw = fs.readFileSync('content/projects/penw/index.md', 'utf8')
const leak = fs.readFileSync('content/projects/leak/index.md', 'utf8')

for (const type of ['image', 'video', 'media', 'hero', 'facts', 'system', 'pipeline', 'gallery', 'timeline', 'compare', 'model3d', 'embed']) {
  check(hasBlockType(type), `schema contains ${type}`)
}
check(BLOCK_TYPES.length >= 18, 'schema exposes rich document vocabulary')
for (const type of ['media', 'model3d', 'gallery', 'facts', 'system', 'pipeline']) {
  check(DIRECTIVE_TYPES.includes(type), `${type} is authorable directive`)
}

check(plugin.includes('DIRECTIVE_TYPES'), 'parser consumes shared schema')
check(plugin.includes('normalizeBlocks'), 'parser normalizes imported markdown')
check(plugin.includes("join(path, 'index.md')"), 'project folder index.md supported')
check(plugin.includes("'.glb': 'model/gltf-binary'"), 'local GLB asset handling supported')
check(plugin.includes('resolveGalleryBody'), 'gallery body assets are resolved')
check(plugin.includes('findLocalAsset'), 'relative project assets supported')

check(blockRegistry.includes('class BlockRegistry'), 'runtime block registry exists')
for (const type of ['hero', 'facts', 'system', 'pipeline', 'gallery', 'timeline', 'compare', 'embed', 'model3d']) {
  check(defaultBlocks.includes(`registry.register('${type}'`), `generic ${type} renderer registered`)
}
check(mediaBlocks.includes("registry.register('media'"), 'full-width media renderer registered')
check(mediaBlocks.includes("provider: 'media-single'"), 'single media opens generic CRT inspector')
check(mediaBlocks.includes("provider: 'media-gallery'"), 'gallery opens generic CRT inspector')
check(mediaBlocks.includes("provider: 'media-compare'"), 'compare opens generic CRT inspector')
check(mediaBlocks.includes('background ?? \'on\''), 'media background is configurable')
check(mediaBlocks.includes('preload() {}'), 'large editorial media skips eager preload')
check(mediaBlocks.includes('if (!env.images.has(src)) env.loadImage(src)'), 'editorial images load on visible paint')

check(integrationRegistry.includes('class IntegrationRegistry'), 'integration registry exists')
for (const provider of ['video', 'youtube', 'sketchfab', 'miro', 'local-3d']) {
  check(integrations.includes(`registry.register('${provider}'`), `${provider} adapter registered`)
}
check(integrations.includes("iframe.loading = 'lazy'"), 'remote iframe adapters request lazy loading')
check(integrations.includes('enablejsapi=1'), 'YouTube API enabled for shield controls')
check(integrations.includes('scrollwheel=0'), 'Sketchfab preserves document wheel')
check(integrations.includes('video.play()'), 'local video adapter owns play action')
check(integrations.includes('video.pause()'), 'local video adapter owns pause action')
check(integrations.includes("video.preload = 'auto'"), 'visible local video promotes preload')
check(integrations.includes('video.load()'), 'visible local video requests first-frame decode')

check(inlineIntegrations.includes('class InlineIntegrationController'), 'inline integration controller exists')
check(inlineIntegrations.includes('_visibleAmount(entry)'), 'inline providers are visibility gated')
check(inlineIntegrations.includes('if (this._visibleAmount(entry) < 2) continue'), 'offscreen providers are not mounted')
check(inlineIntegrations.includes("shield.addEventListener('wheel'"), 'inline embeds preserve document wheel')
check(inlineIntegrations.includes('_toggleYouTube(instance)'), 'YouTube playback uses scroll-safe shield')
check(inlineIntegrations.includes('this.syncing'), 'inline synchronization is non-reentrant')
check(inlineIntegrations.includes('instance.disposed'), 'inline provider cleanup is idempotent')
check(inlineIntegrations.includes('feDisplacementMap'), 'native integrations receive CRT distortion')
check(displayCss.includes('#document-crt-native-optics'), 'native CRT optics are applied by display CSS')

check(local3d.includes('GLTFLoader'), 'local 3D uses GLTFLoader')
check(local3d.includes('OrbitControls'), 'local 3D uses OrbitControls')
check(local3d.includes('_fitCamera(radius)'), 'local 3D auto-frames arbitrary bounds')
check(local3d.includes('controls.connect(proxy)'), '3D render canvas stays separate from DOM input')
check(local3d.includes("proxy.addEventListener('wheel'"), '3D wheel preserves document navigation')
check(local3d.includes('event.ctrlKey'), 'Ctrl+wheel reserved for model zoom')
check(local3d.includes("proxy.addEventListener('dblclick'"), '3D supports camera reset')
check(local3d.includes('object.geometry?.dispose?.()'), '3D geometry is deterministically disposed')
check(local3d.includes('value?.isTexture && value.dispose?.()'), '3D textures are deterministically disposed')
check(local3d.includes('this.renderer.dispose()'), '3D renderer is deterministically disposed')
check(bridge.includes('hasVisibleLocal3D'), 'bridge gates 3D animation by visibility')
check(bridge.includes('if (hasVisibleLocal3D()) local3d.tick(time)'), 'offscreen 3D animation is paused')
check(packageJson.dependencies?.three, 'Three.js dependency declared')
check(packageLock.packages?.['']?.dependencies?.three === packageJson.dependencies?.three, 'Three.js npm lock synchronized')

check(mediaViewer.includes('class MediaViewer'), 'CRT media viewer exists')
check(mediaViewer.includes('media-inspect-hires'), 'CRT-off viewer has hires source')
check(bridge.includes('MediaViewer'), 'document bridge wires CRT media inspection')
check(!bridge.includes('ArticleInteractionController'), 'legacy modal interaction path removed')
check(!fs.existsSync('src/article-interaction.js'), 'legacy modal controller file removed')

check(reader.includes("video.preload = 'none'"), 'local video starts without eager preload')
check(reader.includes('video.volume = panelMediaVolume()'), 'physical volume initializes local video')
check(reader.includes('MutationObserver(() => syncPanelMediaVolume())'), 'physical volume updates live videos')
check(reader.includes('pauseArticleMedia'), 'document has shared media pause boundary')
check(reader.includes("document.addEventListener('visibilitychange'"), 'browser backgrounding pauses media')
check(reader.includes("is-powered-off"), 'physical power off pauses media')
check(reader.includes('pauseArticleMedia(reader)'), 'document replacement pauses previous media')

check(progressOverlay.includes('class DocumentProgressOverlay'), 'generic document progress overlay exists')
check(progressOverlay.includes("block.type === 'heading'"), 'chapter progress derives from headings')
check(bridge.includes('progressOverlay.paint(documentRaster)'), 'chapter progress paints into CRT source')

check(penw.includes('::video{src="/media/penw/'), 'PENW uses local video in real CRT path')
check(!penw.includes('provider=youtube'), 'PENW no longer needs YouTube playback')
check(penw.includes('::model3d{src=/media/penw/arcade-cabinet.glb'), 'PENW uses local GLB')
check(penw.includes('background=off'), 'PENW exercises optional transparent media well')
check(penw.includes('::media{'), 'PENW exercises full-width media')
check(penw.includes('::compare{'), 'PENW exercises compare media')
check(penw.includes('::timeline'), 'PENW exercises timeline')

check(leak.includes('UTILITY AI'), 'Leak documents Director Utility AI')
check(leak.includes('BEHAVIOR TREE'), 'Leak documents Creature Behavior Tree')
check(leak.includes('DISTRACTION'), 'Leak documents noise/distraction counterplay')
check(leak.includes('BODY CAM'), 'Leak documents body-cam systems')
check(leak.includes('DECRYPTION FLOW'), 'Leak documents diegetic decryption workflow')
check(leak.includes('TEN-DAY') || leak.includes('ten-day'), 'Leak documents team sprint cadence')
check(leak.includes('provider=youtube'), 'Leak reuses YouTube fallback adapter')
check(leak.includes('provider=sketchfab'), 'Leak reuses Sketchfab fallback adapter')
check(leak.includes('provider=miro'), 'Leak reuses Miro fallback adapter')
check(leak.includes('::timeline'), 'Leak reuses generic timeline')
check(!fs.existsSync('src/penw.js'), 'no PENW-specific runtime module')
check(!fs.existsSync('src/leak.js'), 'no Leak-specific runtime module')

check(authoring.includes('### Full-width media'), 'authoring guide documents media block')
check(authoring.includes('### Local video'), 'authoring guide documents local video')
check(authoring.includes('background=off'), 'authoring guide documents optional media background')
check(authoring.includes('visible'), 'authoring guide documents visible video loading policy')
check(design.includes('no Leak-specific runtime code'), 'architecture records anti-overfit rule')
check(design.includes('first frame'), 'architecture records first-frame video loading policy')

console.log(failed ? `\n  ${failed} document-engine check(s) FAILED` : '\n  all document-engine checks passed')
process.exit(failed ? 1 : 0)
