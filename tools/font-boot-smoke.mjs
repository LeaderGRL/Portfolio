import { createBootCoordinator } from '../src/boot-coordinator.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(58)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const deferred = () => {
  let resolve
  let reject
  const ready = new Promise((res, rej) => { resolve = res; reject = rej })
  return { ready, resolve, reject }
}

{
  const fonts = deferred()
  let starts = 0
  let installs = 0
  let refreshes = 0
  const app = { refreshTypography: () => { refreshes++ } }
  const coordinator = createBootCoordinator({
    start: () => { starts++; return app },
    install: installed => { if (installed === app) installs++ },
  })

  const first = coordinator.boot()
  const second = coordinator.boot()
  coordinator.observeFonts(fonts)
  coordinator.observeFonts(fonts)

  check(first === app && second === app, 'boot returns the same application instance')
  check(starts === 1, 'application starts exactly once')
  check(installs === 1, 'runtime integrations install exactly once')
  check(refreshes === 0, 'font loading never blocks immediate boot')

  fonts.resolve()
  await fonts.ready
  await Promise.resolve()
  check(refreshes === 1, 'resolved fonts trigger one typography refresh')
}

{
  let starts = 0
  const coordinator = createBootCoordinator({
    start: () => { starts++; return {} },
    install: () => {},
  })
  coordinator.boot()
  coordinator.observeFonts(undefined)
  await Promise.resolve()
  check(starts === 1, 'missing FontFaceSet keeps the application running')
}

{
  const fonts = deferred()
  let refreshes = 0
  const coordinator = createBootCoordinator({
    start: () => ({ refreshTypography: () => { refreshes++ } }),
    install: () => {},
  })
  coordinator.boot()
  coordinator.observeFonts(fonts)
  fonts.reject(new Error('font load failed'))
  try { await fonts.ready } catch {}
  await Promise.resolve()
  check(refreshes === 0, 'font failure does not restart or refresh the app')
}

console.log(failed ? `\n  ${failed} font-boot check(s) FAILED` : '\n  all font-boot checks passed')
process.exit(failed ? 1 : 0)
