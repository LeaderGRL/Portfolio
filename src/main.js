/* Entry point.
 *
 * Boot once the fonts have settled: both the terminal glyph atlas and the
 * article raster source depend on the final font metrics. App owns the single
 * physical CRT pipeline; content providers only supply pixels to it.
 */
import './style.css'
import './display.css'
import './crt-bypass.css'
import './media-viewer.css'
import './contact-links.css'
import './release-fixes.css'
import { start } from './app.js'
import { attachArticleCRT } from './article-crt-bridge.js'
import { installRuntimeControls } from './runtime-controls.js'
import { installSemanticFocusProxy } from './semantic-focus.js'

const boot = () => {
  const app = start()
  installRuntimeControls(app)
  attachArticleCRT(app)
  installSemanticFocusProxy()
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot)
else addEventListener('load', boot)
