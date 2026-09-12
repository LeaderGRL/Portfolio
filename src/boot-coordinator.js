/**
 * Starts the application independently from optional webfont loading, then
 * requests one typography refresh when the initial FontFaceSet settles.
 */
export function createBootCoordinator({ start, install }) {
  if (typeof start !== 'function') throw new TypeError('start must be a function')
  if (typeof install !== 'function') throw new TypeError('install must be a function')

  let app = null
  let fontSetObserved = false

  const boot = () => {
    if (app) return app
    app = start()
    install(app)
    return app
  }

  const observeFonts = fontSet => {
    if (fontSetObserved) return
    fontSetObserved = true

    const ready = fontSet?.ready
    if (!ready || typeof ready.then !== 'function') return

    Promise.resolve(ready).then(
      () => boot().refreshTypography?.(),
      () => {},
    )
  }

  return { boot, observeFonts }
}
