import fs from 'node:fs'
import path from 'node:path'
import { parseInlineMarkdown } from '../src/document/inline-markdown.js'

let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed++
}

const sample = 'Read [docs](https://example.com) with **strong**, __bold__, `code`, *em* and _italic_.'
const parsed = parseInlineMarkdown(sample)
const tokens = parsed.tokens

check(
  tokens.map(token => token.type).join(',') === 'text,link,text,strong,text,strong,text,code,text,em,text,em,text',
  'shared parser emits stable token kinds',
)
check(
  parsed.text === 'Read docs with strong, bold, code, em and italic.',
  'shared parser exposes raster-visible text',
)
check(
  parseInlineMarkdown('plain text').tokens.length === 1 && parseInlineMarkdown('plain text').tokens[0].type === 'text',
  'plain text stays a single token',
)
check(
  parseInlineMarkdown('**a***b*').tokens.map(token => token.type).join(',') === 'strong,em',
  'adjacent inline tokens remain independent',
)

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
visit(path.resolve('content'))

let corpusCompatible = true
for (const file of markdownFiles) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (parseInlineMarkdown(line).text !== legacyStripInline(line)) {
      corpusCompatible = false
      console.error(`Inline text drift in ${path.relative(process.cwd(), file)}: ${line}`)
      break
    }
  }
  if (!corpusCompatible) break
}
check(corpusCompatible, 'shared tokens preserve raster text across current Markdown content')

console.log(failed ? `\n  ${failed} inline-markdown check(s) FAILED` : '\n  all inline-markdown checks passed')
process.exitCode = failed ? 1 : 0
