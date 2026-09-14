import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { parseInlineMarkdown } from '../../../src/document/inline-markdown.js'

const legacyStripInline = (text = '') => String(text)
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/__([^_]+)__/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\*([^*\n]+)\*/g, '$1')
  .replace(/_([^_\n]+)_/g, '$1')

const markdownFiles = []
const visit = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) visit(full)
    else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(full)
  }
}

test('inline parser emits stable token kinds and raster-visible text', () => {
  const sample = 'Read [docs](https://example.com) with **strong**, __bold__, `code`, *em* and _italic_.'
  const parsed = parseInlineMarkdown(sample)

  assert.equal(
    parsed.tokens.map(token => token.type).join(','),
    'text,link,text,strong,text,strong,text,code,text,em,text,em,text',
  )
  assert.equal(parsed.text, 'Read docs with strong, bold, code, em and italic.')
  assert.deepEqual(parseInlineMarkdown('plain text').tokens.map(token => token.type), ['text'])
  assert.deepEqual(parseInlineMarkdown('**a***b*').tokens.map(token => token.type), ['strong', 'em'])
})

test('inline tokens preserve raster text across current Markdown content', () => {
  visit(path.resolve('content'))

  for (const file of markdownFiles) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      assert.equal(
        parseInlineMarkdown(line).text,
        legacyStripInline(line),
        `Inline text drift in ${path.relative(process.cwd(), file)}: ${line}`,
      )
    }
  }
})
