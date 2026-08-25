import fs from 'node:fs'
import { BLOCK_TYPES, DIRECTIVE_TYPES, hasBlockType } from '../src/document/schema.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(44)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const plugin = fs.readFileSync('plugins/content.js', 'utf8')
const design = fs.readFileSync('docs/PROJECT_EXPERIENCE_ENGINE.md', 'utf8')
const blockRegistry = fs.readFileSync('src/document/block-registry.js', 'utf8')
const integrationRegistry = fs.readFileSync('src/document/integration-registry.js', 'utf8')

for (const type of ['image', 'video', 'hero', 'gallery', 'timeline', 'compare', 'model3d', 'embed']) {
  check(hasBlockType(type), `schema contains ${type}`)
}

check(BLOCK_TYPES.length >= 14, 'schema exposes rich document vocabulary')
check(DIRECTIVE_TYPES.includes('model3d'), 'model3d is authorable directive')
check(DIRECTIVE_TYPES.includes('gallery'), 'gallery is authorable directive')
check(plugin.includes('DIRECTIVE_TYPES'), 'parser consumes shared schema')
check(!plugin.includes("new Set(['image', 'video'"), 'parser has no duplicated directive list')
check(plugin.includes("join(path, 'index.md')"), 'project folder index.md supported')
check(plugin.includes("'.glb': 'model/gltf-binary'"), 'local GLB asset inlining supported')
check(plugin.includes('findLocalAsset'), 'relative project assets supported')
check(blockRegistry.includes('class BlockRegistry'), 'runtime block registry exists')
check(integrationRegistry.includes('class IntegrationRegistry'), 'integration registry exists')
check(design.includes('no Leak-specific runtime code'), 'architecture records anti-overfit rule')
check(design.includes('no PENW-specific runtime code'), 'PENW validation rule documented')
check(design.includes('Local `.glb` is rendered by Three.js'), 'local 3D strategy documented')

console.log(failed ? `\n  ${failed} document-engine check(s) FAILED` : '\n  all document-engine checks passed')
process.exit(failed ? 1 : 0)
