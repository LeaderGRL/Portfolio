import fs from 'node:fs'
import { parseBody } from '../plugins/content.js'

let failed = 0
const check = (condition, label) => {
  console.log(`  ${label.padEnd(62)}: ${condition ? 'OK' : 'WRONG'}`)
  if (!condition) failed++
}

const probe = parseBody(`
::media{src=example.webp label="EXAMPLE"}
## AFTER MEDIA
This paragraph must remain visible.

::embed{provider=iframe src="https://example.com" title="EXAMPLE"}
## AFTER EMBED
This paragraph must also remain visible.

::note
A multiline note still owns its body.
::
## AFTER NOTE
Final paragraph.
`, 'article-parser-probe')

check(probe[0]?.type === 'media', 'media directive is parsed')
check(probe[1]?.type === 'heading' && probe[1]?.text === 'AFTER MEDIA', 'media does not consume following heading')
check(probe[2]?.type === 'prose' && /remain visible/.test(probe[2]?.text), 'media does not consume following prose')
check(probe[3]?.type === 'embed', 'embed directive is parsed')
check(probe[4]?.type === 'heading' && probe[4]?.text === 'AFTER EMBED', 'embed does not consume following heading')
check(probe[6]?.type === 'note' && /multiline note/.test(probe[6]?.body), 'multiline note still consumes its body')
check(probe[7]?.type === 'heading' && probe[7]?.text === 'AFTER NOTE', 'content resumes after multiline directive')

const articlePath = 'content/articles/01-ecs-entity-management.md'
const raw = fs.readFileSync(articlePath, 'utf8')
const body = raw.replace(/^---[\s\S]*?\n---\n/, '')
const blocks = parseBody(body, articlePath)
const firstMedia = blocks.findIndex(block => block.type === 'media' && /health pickup/i.test(block.label || ''))

check(firstMedia >= 0, 'real ECS article contains first imported media')
check(blocks[firstMedia + 1]?.type === 'heading' && /This Happens Constantly/i.test(blocks[firstMedia + 1]?.text || ''), 'real ECS article keeps heading immediately after media')
check(blocks.some(block => block.type === 'heading' && block.text === 'Memory Usage'), 'real ECS article keeps later Memory Usage section')
check(blocks.some(block => block.type === 'heading' && block.text === 'Conclusion'), 'real ECS article reaches its Conclusion')

for (const file of [
  '01-ecs-entity-management.md',
  '02-ecs-rust-data-oriented-design.md',
  '03-cpu-cache-optimization.md',
  '04-graph-algorithms-rust.md',
  '06-parallax-cards-rive.md',
]) {
  const source = fs.readFileSync(`content/articles/${file}`, 'utf8').replace(/^---[\s\S]*?\n---\n/, '')
  const parsed = parseBody(source, file)
  check(parsed.length > 10, `${file} parses into a complete block stream`)
}

console.log(failed ? `\n  ${failed} article-parser check(s) FAILED` : '\n  all article-parser checks passed')
process.exit(failed ? 1 : 0)
