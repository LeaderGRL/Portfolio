/**
 * Cross-platform launcher for the asset pipeline.
 *
 * `python3` is not a command on Windows — it resolves to a Microsoft Store
 * stub that prints a help message and exits 0, so the npm script appeared to
 * succeed while producing nothing. This tries the interpreters that actually
 * exist on each platform and fails loudly if none of them can import the
 * libraries the pipeline needs.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = [join(here, 'build_assets.py'), join(here, 'build_chassis.py')]
const candidates = process.platform === 'win32'
  ? ['py -3', 'python', 'python3']
  : ['python3', 'python']

for (const cmd of candidates) {
  const [bin, ...pre] = cmd.split(' ')
  const probe = spawnSync(bin, [...pre, '-c', 'import PIL, numpy, scipy'], { stdio: 'ignore' })
  if (probe.status !== 0) continue
  let status = 0
  for (const script of scripts) {
    const run = spawnSync(bin, [...pre, script], { stdio: 'inherit' })
    status = run.status ?? 1
    if (status !== 0) break
  }
  process.exit(status)
}

console.error(`
No Python interpreter with the pipeline's dependencies was found.

  tried: ${candidates.join(', ')}
  need : pillow, numpy, scipy

Install them with:

  pip install pillow numpy scipy

On Windows use "py -3 -m pip install pillow numpy scipy" if pip is not on PATH.
`)
process.exit(1)
