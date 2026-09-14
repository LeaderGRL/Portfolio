import fs from 'node:fs'
import path from 'node:path'

export const NARRATION_EXTENSIONS = new Set(['.mp3', '.ogg', '.opus', '.m4a'])

export function parseFrontMatter(raw) {
  if (!raw.startsWith('---')) return [{}, raw]
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return [{}, raw]

  const head = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\n+/, '')
  const meta = {}

  for (const line of head.split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(entry => entry.trim()).filter(Boolean)
    }
    meta[key] = value
  }

  return [meta, body]
}

export function collectionDocumentPaths(root) {
  if (!fs.existsSync(root)) return []

  const documents = []
  for (const entry of fs.readdirSync(root).sort()) {
    const entryPath = path.join(root, entry)
    const stat = fs.statSync(entryPath)
    if (stat.isFile() && path.extname(entry).toLowerCase() === '.md') {
      documents.push(entryPath)
      continue
    }
    if (!stat.isDirectory()) continue

    const indexPath = path.join(entryPath, 'index.md')
    if (fs.existsSync(indexPath)) documents.push(indexPath)
  }
  return documents
}

function decodedNarrationPath(value, documentPath) {
  try {
    return decodeURIComponent(new URL(value, 'https://portfolio.invalid').pathname)
  } catch {
    throw new Error(`${documentPath}: narration path has invalid URL encoding`)
  }
}

function isWithin(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`)
}

export function validateNarrationSource(source, documentPath, publicRoot = 'public') {
  if (source === undefined || source === null || source === '') return ''
  if (typeof source !== 'string') {
    throw new Error(`${documentPath}: narration must be a string URL path`)
  }

  const value = source.trim()
  if (!value) return ''

  if (!value.startsWith('/')) {
    throw new Error(`${documentPath}: narration must be a local Portfolio asset`)
  }
  if (!value.startsWith('/media/narration/')) {
    throw new Error(`${documentPath}: narration must live under /media/narration/`)
  }

  const decodedPath = decodedNarrationPath(value, documentPath)
  const extension = path.extname(decodedPath).toLowerCase()
  if (!NARRATION_EXTENSIONS.has(extension)) {
    throw new Error(`${documentPath}: unsupported narration format: ${extension || '(none)'}`)
  }

  const narrationRoot = path.resolve(publicRoot, 'media', 'narration')
  const assetPath = path.resolve(publicRoot, `.${decodedPath}`)
  if (!isWithin(narrationRoot, assetPath)) {
    throw new Error(`${documentPath}: narration path escapes /media/narration/`)
  }
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    throw new Error(`${documentPath}: narration file not found: ${value}`)
  }

  const realNarrationRoot = fs.realpathSync(narrationRoot)
  const realAssetPath = fs.realpathSync(assetPath)
  if (!isWithin(realNarrationRoot, realAssetPath)) {
    throw new Error(`${documentPath}: narration file resolves outside /media/narration/`)
  }

  return value
}

export function validateNarrationDocument(documentPath, publicRoot = 'public') {
  const [meta] = parseFrontMatter(fs.readFileSync(documentPath, 'utf8'))
  if (!meta.narration) return null
  return validateNarrationSource(meta.narration, documentPath, publicRoot)
}
