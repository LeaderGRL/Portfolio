import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  collectionDocumentPaths,
  parseFrontMatter,
  validateNarrationSource,
} from '../../../tools/narration-validator.mjs'
import { toContentEntry } from '../../../src/content-entry.js'

test('front matter preserves narration metadata into runtime content entries', () => {
  const [meta] = parseFrontMatter(`---\ntitle: ASTRO\nnarration: /media/narration/astro.mp3\n---\nBody`)
  const entry = toContentEntry({ id: 'astro', ...meta, blocks: [] })

  assert.equal(meta.narration, '/media/narration/astro.mp3')
  assert.equal(entry.narration, '/media/narration/astro.mp3')
})

test('documents without narration remain non-narratable', () => {
  const entry = toContentEntry({ id: 'plain', title: 'PLAIN', blocks: [] })
  assert.equal(entry.narration, '')
})

test('local narration validation accepts an existing supported asset', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-narration-'))
  const narrationDir = path.join(root, 'media', 'narration')
  fs.mkdirSync(narrationDir, { recursive: true })
  fs.writeFileSync(path.join(narrationDir, 'astro.mp3'), 'fixture')

  assert.equal(
    validateNarrationSource('/media/narration/astro.mp3', 'content/projects/astro/index.md', root),
    '/media/narration/astro.mp3',
  )
})

test('local narration validation accepts URL-encoded filenames', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-narration-'))
  const narrationDir = path.join(root, 'media', 'narration')
  fs.mkdirSync(narrationDir, { recursive: true })
  fs.writeFileSync(path.join(narrationDir, 'Démo Voice.mp3'), 'fixture')

  assert.equal(
    validateNarrationSource('/media/narration/D%C3%A9mo%20Voice.mp3', 'content/projects/demo/index.md', root),
    '/media/narration/D%C3%A9mo%20Voice.mp3',
  )
})

test('local narration validation rejects missing assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-narration-'))

  assert.throws(
    () => validateNarrationSource('/media/narration/missing.mp3', 'content/projects/missing/index.md', root),
    /narration file not found/i,
  )
})

test('local narration validation rejects unsupported formats and paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-narration-'))

  assert.throws(
    () => validateNarrationSource('/media/narration/astro.wav', 'content/projects/astro/index.md', root),
    /unsupported narration format/i,
  )
  assert.throws(
    () => validateNarrationSource('/media/Astro/menu.mp3', 'content/projects/astro/index.md', root),
    /must live under \/media\/narration\//i,
  )
  assert.throws(
    () => validateNarrationSource('https://example.com/astro.mp3', 'content/projects/astro/index.md', root),
    /must be a local portfolio asset/i,
  )
})

test('local narration validation requires a string source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-narration-'))

  assert.throws(
    () => validateNarrationSource(['/media/narration/voice.mp3'], 'content/projects/astro/index.md', root),
    /narration must be a string url path/i,
  )
})

test('local narration validation rejects files resolving outside the narration directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-narration-'))
  const narrationDir = path.join(root, 'media', 'narration')
  fs.mkdirSync(narrationDir, { recursive: true })
  const outside = path.join(root, 'outside.mp3')
  fs.writeFileSync(outside, 'fixture')

  const link = path.join(narrationDir, 'linked.mp3')
  try {
    fs.symlinkSync(outside, link)
  } catch (error) {
    if (process.platform === 'win32' && (error?.code === 'EPERM' || error?.code === 'EACCES')) return
    throw error
  }

  assert.throws(
    () => validateNarrationSource('/media/narration/linked.mp3', 'content/projects/astro/index.md', root),
    /resolves outside \/media\/narration\//i,
  )
})

test('narration content traversal mirrors loaded collection documents', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-content-'))
  fs.writeFileSync(path.join(root, 'single.md'), '# Single')
  fs.mkdirSync(path.join(root, 'project', 'assets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'project', 'index.md'), '# Project')
  fs.writeFileSync(path.join(root, 'project', 'assets', 'README.md'), '# Auxiliary')
  fs.mkdirSync(path.join(root, 'without-index'), { recursive: true })
  fs.writeFileSync(path.join(root, 'without-index', 'notes.md'), '# Auxiliary')

  const result = collectionDocumentPaths(root).map(file => path.relative(root, file).replaceAll('\\', '/'))
  assert.deepEqual(result, ['project/index.md', 'single.md'])
})

test('narration content traversal follows document symlinks like the content plugin', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-content-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'jg1500-linked-content-'))
  const linkedFileTarget = path.join(outside, 'linked.md')
  const linkedDirTarget = path.join(outside, 'linked-project')
  fs.writeFileSync(linkedFileTarget, '# Linked file')
  fs.mkdirSync(linkedDirTarget, { recursive: true })
  fs.writeFileSync(path.join(linkedDirTarget, 'index.md'), '# Linked project')

  try {
    fs.symlinkSync(linkedFileTarget, path.join(root, 'linked-file.md'))
    fs.symlinkSync(linkedDirTarget, path.join(root, 'linked-dir'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (process.platform === 'win32' && (error?.code === 'EPERM' || error?.code === 'EACCES')) return
    throw error
  }

  const result = collectionDocumentPaths(root).map(file => path.relative(root, file).replaceAll('\\', '/'))
  assert.deepEqual(result, ['linked-dir/index.md', 'linked-file.md'])
})
