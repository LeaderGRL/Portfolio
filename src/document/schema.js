/* ========================================================================== *
 * Document schema
 *
 * Pure data only: this module is imported by both the Vite content compiler
 * (Node) and the browser runtime. Keeping the vocabulary here prevents the
 * parser and renderer from silently drifting apart as richer project blocks
 * are added.
 * ========================================================================== */

export const BLOCK_DEFINITIONS = Object.freeze({
  heading: Object.freeze({ kind: 'text' }),
  prose: Object.freeze({ kind: 'text' }),
  list: Object.freeze({ kind: 'text' }),
  code: Object.freeze({ kind: 'text' }),
  figure: Object.freeze({ kind: 'text', body: true }),
  note: Object.freeze({ kind: 'text', body: true }),

  image: Object.freeze({ kind: 'media', assetFields: ['src'] }),
  video: Object.freeze({ kind: 'media', assetFields: ['src'], interactive: true }),

  hero: Object.freeze({ kind: 'composition', assetFields: ['media', 'poster'] }),
  media: Object.freeze({ kind: 'composition', assetFields: ['src'], interactive: true }),
  facts: Object.freeze({ kind: 'composition', body: true }),
  system: Object.freeze({ kind: 'composition', body: true }),
  pipeline: Object.freeze({ kind: 'composition', body: true }),
  gallery: Object.freeze({ kind: 'composition', body: true }),
  timeline: Object.freeze({ kind: 'composition', body: true }),
  compare: Object.freeze({ kind: 'composition', assetFields: ['before', 'after'] }),

  model3d: Object.freeze({
    kind: 'integration',
    assetFields: ['src', 'poster'],
    interactive: true,
    provider: 'local-3d',
  }),

  embed: Object.freeze({
    kind: 'integration',
    assetFields: ['poster'],
    interactive: true,
    provider: 'iframe',
  }),
})

export const BLOCK_TYPES = Object.freeze(Object.keys(BLOCK_DEFINITIONS))
export const DIRECTIVE_TYPES = Object.freeze(
  BLOCK_TYPES.filter(type => !['heading', 'prose', 'list', 'code'].includes(type)),
)

export function hasBlockType(type) {
  return Object.prototype.hasOwnProperty.call(BLOCK_DEFINITIONS, type)
}

export function getBlockDefinition(type) {
  return BLOCK_DEFINITIONS[type] || null
}

export function isInteractiveBlock(block) {
  return Boolean(block && BLOCK_DEFINITIONS[block.type]?.interactive)
}

export function assertBlockType(type, context = 'document') {
  if (hasBlockType(type)) return type
  throw new Error(`${context}: unknown document block "${type}"`)
}

export const INTEGRATION_PROVIDERS = Object.freeze([
  'iframe',
  'gist',
  'sketchfab',
  'youtube',
  'miro',
  'google',
  'local-3d',
])

export function normalizeProvider(block) {
  if (!block) return null
  if (block.type === 'model3d') return 'local-3d'
  if (block.type === 'video') return 'video'
  return String(block.provider || 'iframe').toLowerCase()
}
