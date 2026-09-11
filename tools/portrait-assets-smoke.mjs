import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'build', 'meta.json'), 'utf8'))
const PORTRAIT_SOURCE = path.join(ROOT, 'assets', 'src', 'portrait-chassis')
const BUILD = path.join(ROOT, 'assets', 'build')

const expected = fs.readdirSync(PORTRAIT_SOURCE)
  .filter(name => /^\d+x\d+\.png$/i.test(name))
  .map(name => name.replace(/\.png$/i, ''))
  .sort()
const profiles = META.portrait_chassis?.profiles || []
const actual = profiles.map(profile => profile.id).sort()

function check(label, condition) {
  if (!condition) throw new Error(`portrait assets: ${label}`)
  console.log(`  ${label.padEnd(58)}: OK`)
}

check('all portrait source profiles are represented', JSON.stringify(actual) === JSON.stringify(expected))
check('at least one portrait profile exists', profiles.length > 0)

const target = META.portrait_chassis.cream_reference
for (const profile of profiles) {
  const [left, top, right, bottom] = profile.aperture
  const [refLeft, refTop, refRight, refBottom] = profile.reference_aperture || []
  const [offsetX, offsetY, scaleX, scaleY] = profile.frame_transform || []
  const [viewportWidth, viewportHeight] = profile.viewport
  const output = path.join(BUILD, `${profile.asset}.webp`)
  const maxCreamDelta = Math.max(...profile.cream_after.map((value, index) => Math.abs(value - target[index])))

  check(`${profile.id}: viewport matches id`, `${viewportWidth}x${viewportHeight}` === profile.id)
  check(`${profile.id}: aperture is bounded`, left > 0 && top > 0 && right < 1 && bottom < .65 && right > left && bottom > top)
  check(`${profile.id}: reference aperture is bounded`, refLeft > 0 && refTop > 0 && refRight < 1 && refBottom < .65 && refRight > refLeft && refBottom > refTop)
  check(`${profile.id}: frame transform is finite`, [offsetX, offsetY, scaleX, scaleY].every(Number.isFinite) && scaleX > .5 && scaleY > .5)
  check(`${profile.id}: frame transform maps aperture`,
    Math.abs((offsetX + scaleX * left) - refLeft) < 0.00001
    && Math.abs((offsetY + scaleY * top) - refTop) < 0.00001
    && Math.abs((offsetX + scaleX * right) - refRight) < 0.00001
    && Math.abs((offsetY + scaleY * bottom) - refBottom) < 0.00001)
  check(`${profile.id}: normalized cream matches desktop`, maxCreamDelta <= 3)
  check(`${profile.id}: generated frame exists`, fs.existsSync(output) && fs.statSync(output).size > 8_000)
}

console.log(`\n  ${profiles.length} portrait chassis profiles validated`)
