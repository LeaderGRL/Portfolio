/* Entry point.
 *
 * Boot does not depend on webfont availability. The chassis can render with
 * fallback metrics immediately, then refresh its fitted geometry once the
 * initial FontFaceSet settles. App still owns the single physical CRT pipeline.
 */
import './style.css'
import './display.css'
import './semantic-focus.css'
import './crt-bypass.css'
import './media-viewer.css'
import './contact-links.css'
import './landscape-mobile.css'
import './landscape-action-keys.css'
import './portrait-mobile.css'
import './fullscreen.css'
import { start } from './app.js'
import { attachArticleCRT } from './article-crt-bridge.js'
import { installFullscreenSoftkeys } from './fullscreen-softkeys.js'
import { installRuntimeControls } from './runtime-controls.js'
import { installSemanticFocusProxy } from './semantic-focus.js'
import { installLandscapeMobileLayout } from './landscape-mobile.js'
import { installLandscapeActionKeys } from './landscape-action-keys.js'
import { installPortraitMobileLayout } from './portrait-mobile.js'
import { createBootCoordinator } from './boot-coordinator.js'

const install = app => {
  installLandscapeActionKeys()
  installLandscapeMobileLayout(app)
  installPortraitMobileLayout(app)
  installRuntimeControls(app)
  attachArticleCRT(app)
  installSemanticFocusProxy()
  installFullscreenSoftkeys(app)
}

const boot = createBootCoordinator({ start, install })
boot.boot()
boot.observeFonts(document.fonts)
