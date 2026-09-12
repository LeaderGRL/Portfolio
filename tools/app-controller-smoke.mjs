import fs from 'node:fs'
import path from 'node:path'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(62)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const app = fs.readFileSync('src/app.js', 'utf8')
const controllers = {
  input: fs.readFileSync('src/controllers/input-controller.js', 'utf8'),
  machine: fs.readFileSync('src/controllers/machine-state-controller.js', 'utf8'),
  navigation: fs.readFileSync('src/controllers/navigation-controller.js', 'utf8'),
  render: fs.readFileSync('src/controllers/render-controller.js', 'utf8'),
}

const sourceFiles = fs.readdirSync('src', { recursive: true })
  .filter(file => file.endsWith('.js'))
  .map(file => path.resolve('src', file))
const sourceSet = new Set(sourceFiles)
const dependencies = new Map(sourceFiles.map(file => {
  const source = fs.readFileSync(file, 'utf8')
  const imports = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
    .map(match => path.resolve(path.dirname(file), match[1]))
    .map(target => path.extname(target) ? target : `${target}.js`)
    .filter(target => sourceSet.has(target))
  return [file, imports]
}))

const visiting = new Set()
const visited = new Set()
const visit = file => {
  if (visiting.has(file)) return true
  if (visited.has(file)) return false
  visiting.add(file)
  const cyclic = dependencies.get(file)?.some(visit) || false
  visiting.delete(file)
  visited.add(file)
  return cyclic
}

for (const [name, source] of Object.entries(controllers)) {
  check(!/from\s+['"][^'"]*app\.js['"]/.test(source), `${name} controller does not import App`)
}

check(app.includes('new InputController(this, this.machineController)'), 'App composes input controller')
check(app.includes('new MachineStateController(this)'), 'App composes machine-state controller')
check(app.includes('new NavigationController(this)'), 'App composes navigation controller')
check(app.includes('new RenderController(this)'), 'App composes render controller')
check(app.includes('return this.navigationController.go('), 'App preserves navigation API by delegation')
check(app.includes('return this.machineController.setFullscreen('), 'App preserves fullscreen API by delegation')
check(app.includes('return this.renderController.render('), 'App preserves render API by delegation')
check(controllers.input.includes("addEventListener('keydown'"), 'input controller owns keyboard routing')
check(controllers.machine.includes('togglePower()'), 'machine controller owns power transitions')
check(controllers.machine.includes('syncNativeFullscreen(on)'), 'machine controller owns native fullscreen state')
check(controllers.navigation.includes('syncNavigationHistory'), 'navigation controller owns browser history')
check(controllers.render.includes('requestAnimationFrame(next => this.frame(next))'), 'render controller owns the frame loop')
check(controllers.render.includes('app.documentRuntime?.paint?.'), 'render controller owns document paint scheduling')
check(!sourceFiles.some(visit), 'source module graph has no circular dependency')

const appLines = app.split(/\r?\n/).length
check(appLines < 300, `App composition root stays focused (${appLines} lines)`)

if (failed) {
  console.error(`\n  ${failed} app-controller check(s) failed`)
  process.exit(1)
}

console.log('\n  all app-controller checks passed')
