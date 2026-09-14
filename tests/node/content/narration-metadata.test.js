import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { parseFrontMatter, validateNarrationSource } from '../../../plugins/content.js'
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
