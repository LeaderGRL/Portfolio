import fs from 'node:fs'
import { BLOCK_TYPES, DIRECTIVE_TYPES, hasBlockType } from '../src/document/schema.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(52)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const plugin = fs.readFileSync('plugins/content.js', 'utf8')
const design = fs.readFileSync('docs/PROJECT_EXPERIENCE_ENGINE.md', 'utf8')
const blockRegistry = fs.readFileSync('src/document/block-registry.js', 'utf8')
const defaultBlocks = fs.readFileSync('src/document/default-blocks.js', 'utf8')
const integrationRegistry = fs.readFileSync('src/document/integration-registry.js', 'utf8')
const integrations = fs.readFileSync('src/document/default-integrations.js', 'utf8')
const inlineIntegrations = fs.readFileSync('src/document/inline-integrations.js', 'utf8')
const local3d = fs.readFileSync('src/document/local-3d.js', 'utf8')
const bridge = fs.readFileSync('src/article-crt-bridge.js', 'utf8')
const reader = fs.readFileSync('src/article-reader.js', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const penw = fs.readFileSync('content/projects/penw/index.md', 'utf8')

for (const type of ['image', 'video', 'hero', 'gallery', 'timeline', 'compare', 'model3d', 'embed']) {
  check(hasBlockType(type), `schema contains ${type}`)
}

check(BLOCK_TYPES.length >= 14, 'schema exposes rich document vocabulary')
check(DIRECTIVE_TYPES.includes('model3d'), 'model3d is authorable directive')
check(DIRECTIVE_TYPES.includes('gallery'), 'gallery is authorable directive')
check(plugin.includes('DIRECTIVE_TYPES'), 'parser consumes shared schema')
check(plugin.includes('normalizeBlocks'), 'parser normalizes imported markdown headings')
check(plugin.includes("line.trim()"), 'heading parser tolerates indentation')
check(!plugin.includes("new Set(['image', 'video'"), 'parser has no duplicated directive list')
check(plugin.includes("join(path, 'index.md')"), 'project folder index.md supported')
check(plugin.includes("'.glb': 'model/gltf-binary'"), 'local GLB asset inlining supported')
check(plugin.includes('resolveGalleryBody'), 'gallery body assets are resolved')
check(plugin.includes('findLocalAsset'), 'relative project assets supported')

check(blockRegistry.includes('class BlockRegistry'), 'runtime block registry exists')
check(defaultBlocks.includes("registry.register('hero'"), 'generic hero renderer registered')
check(defaultBlocks.includes("registry.register('gallery'"), 'generic gallery renderer registered')
check(defaultBlocks.includes("registry.register('timeline'"), 'generic timeline renderer registered')
check(defaultBlocks.includes("registry.register('compare'"), 'generic compare renderer registered')
check(defaultBlocks.includes("registry.register('embed'"), 'generic inline embed block registered')
check(defaultBlocks.includes('inline: true'), 'inline interaction contract declared')
check(defaultBlocks.includes("registry.register('model3d'"), 'generic local 3D renderer registered')

check(integrationRegistry.includes('class IntegrationRegistry'), 'integration registry exists')
check(integrations.includes("registry.register('youtube'"), 'YouTube adapter registered')
check(integrations.includes("registry.register('sketchfab'"), 'Sketchfab adapter registered')
check(integrations.includes("registry.register('local-3d'"), 'local 3D adapter registered')
check(inlineIntegrations.includes('class InlineIntegrationController'), 'inline integration controller exists')
check(inlineIntegrations.includes('_position(host, entry)'), 'inline integrations follow raster layout')

check(local3d.includes('GLTFLoader'), 'local 3D uses GLTFLoader')
check(local3d.includes('OrbitControls'), 'local 3D uses OrbitControls')
check(local3d.includes('mountInput'), 'local 3D has CRT-preserving input proxy')
check(packageJson.dependencies?.three, 'Three.js dependency declared')

check(bridge.includes('createDefaultBlockRegistry'), 'document bridge wires block registry')
check(bridge.includes('createDefaultIntegrationRegistry'), 'document bridge wires integration adapters')
check(bridge.includes('InlineIntegrationController'), 'document bridge wires inline integrations')
check(reader.includes("case 'hero'"), 'semantic mirror accounts for hero height')
check(reader.includes("case 'model3d'"), 'semantic mirror accounts for 3D height')
check(reader.includes("case 'embed'"), 'semantic mirror accounts for embed height')

check(penw.includes('::hero{'), 'PENW uses generic hero block')
check(penw.includes('provider=youtube'), 'PENW uses generic YouTube adapter')
check(penw.includes('provider=sketchfab'), 'PENW uses generic Sketchfab adapter')
check(penw.includes('::timeline'), 'PENW uses generic timeline block')
check(!penw.toLowerCase().includes('genial.ly'), 'PENW no longer embeds Genially')
check(!fs.existsSync('src/penw.js'), 'no PENW-specific runtime module')
check(!fs.existsSync('src/leak.js'), 'no Leak-specific runtime module')

check(design.includes('no Leak-specific runtime code'), 'architecture records anti-overfit rule')
check(design.includes('no PENW-specific runtime code'), 'PENW validation rule documented')
check(design.includes('Local `.glb` is rendered by Three.js'), 'local 3D strategy documented')

console.log(failed ? `\n  ${failed} document-engine check(s) FAILED` : '\n  all document-engine checks passed')
process.exit(failed ? 1 : 0)
