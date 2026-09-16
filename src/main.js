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
import './crt-cursor.css'
import { start } from './app.js'
import { attachArticleCRT } from './article-crt-bridge.js'
import { installFullscreenSoftkeys } from './fullscreen-softkeys.js'
import { installRuntimeControls } from './runtime-controls.js'
import { installSemanticFocusProxy } from './semantic-focus.js'
import { installLandscapeMobileLayout } from './landscape-mobile.js'
import { installLandscapeActionKeys } from './landscape-action-keys.js'
import { installPortraitMobileLayout } from './portrait-mobile.js'
import { createBootCoordinator } from './boot-coordinator.js'
import { createPointerSampleBuffer } from './crt-cursor-pointer-buffer.js'

const performanceProbeBoot = globalThis.__JG1500_PERF_TEST__ === true
  // performance.now() is relative to the document time origin, which exists
  // before the static ESM graph is fetched/evaluated. Zero therefore includes
  // module loading instead of starting the measurement inside main.js.
  ? { entryAt: 0 }
  : null

const install = app => {
  installLandscapeActionKeys()
  installLandscapeMobileLayout(app)
  installPortraitMobileLayout(app)
  installRuntimeControls(app)
  attachArticleCRT(app)
  installSemanticFocusProxy()
  installFullscreenSoftkeys(app)

  // Cursor ownership is not required to paint or interact with the first app
  // frame. Load it immediately as a small non-blocking feature chunk so the
  // established boot bundle budget remains intact; native cursor behavior is
  // the fail-safe until installation succeeds. A tiny synchronous buffer keeps
  // the last observable pointer sample so an enter-and-stop during chunk load
  // is not lost before the production controller installs its own listener.
  const cursorPointerBuffer = createPointerSampleBuffer(globalThis.window).start()
  void import('./crt-cursor-runtime-controller.js').then(
    ({ CrtCursorRuntimeController }) => {
      const cursorController = new CrtCursorRuntimeController(app).install()
      const bufferedPointerSample = cursorPointerBuffer.stop().consume()
      app.cursorController = cursorController
      if (bufferedPointerSample) cursorController.handlePointerMove(bufferedPointerSample)
    },
    error => {
      cursorPointerBuffer.stop()
      console.warn('CRT cursor unavailable; using the native cursor', error)
    },
  )
}

const boot = createBootCoordinator({ start, install })
const app = boot.boot()
// Keep the runtime observable only for deterministic Playwright snapshots.
// The flag is injected before module evaluation and is never set in production.
if (globalThis.__JG1500_VISUAL_TEST__ === true) globalThis.__JG1500_APP__ = app
if (performanceProbeBoot) {
  performanceProbeBoot.appReadyAt = performance.now()
  void import('./performance-instrumentation.js').then(
    ({ installPerformanceInstrumentation }) => {
      globalThis.__JG1500_PERF__ = installPerformanceInstrumentation(app, performanceProbeBoot)
    },
    error => {
      globalThis.__JG1500_PERF_ERROR__ = error instanceof Error ? error.message : String(error)
    },
  )
}
boot.observeFonts(document.fonts)
