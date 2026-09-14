import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { parseBody } from '../../../plugins/content.js'

test('single-line directives do not consume following article blocks', () => {
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

  assert.equal(probe[0]?.type, 'media')
  assert.equal(probe[1]?.type, 'heading')
  assert.equal(probe[1]?.text, 'AFTER MEDIA')
  assert.equal(probe[2]?.type, 'prose')
  assert.match(probe[2]?.text ?? '', /remain visible/)
  assert.equal(probe[3]?.type, 'embed')
  assert.equal(probe[4]?.type, 'heading')
  assert.equal(probe[4]?.text, 'AFTER EMBED')
  assert.equal(probe[6]?.type, 'note')
  assert.match(probe[6]?.body ?? '', /multiline note/)
  assert.equal(probe[7]?.type, 'heading')
  assert.equal(probe[7]?.text, 'AFTER NOTE')
})

test('real ECS article keeps headings after imported media', () => {
  const articlePath = 'content/articles/01-ecs-entity-management.md'
  const raw = fs.readFileSync(articlePath, 'utf8')
  const body = raw.replace(/^---[\s\S]*?\n---\n/, '')
  const blocks = parseBody(body, articlePath)
  const firstMedia = blocks.findIndex(block => block.type === 'media' && /health pickup/i.test(block.label || ''))

  assert.ok(firstMedia >= 0)
  assert.equal(blocks[firstMedia + 1]?.type, 'heading')
  assert.match(blocks[firstMedia + 1]?.text ?? '', /This Happens Constantly/i)
  assert.ok(blocks.some(block => block.type === 'heading' && block.text === 'Memory Usage'))
  assert.ok(blocks.some(block => block.type === 'heading' && block.text === 'Conclusion'))
})

for (const file of [
  '01-ecs-entity-management.md',
  '02-ecs-rust-data-oriented-design.md',
  '03-cpu-cache-optimization.md',
  '04-graph-algorithms-rust.md',
  '06-parallax-cards-rive.md',
]) {
  test(`${file} parses into a complete block stream`, () => {
    const source = fs.readFileSync(`content/articles/${file}`, 'utf8').replace(/^---[\s\S]*?\n---\n/, '')
    const parsed = parseBody(source, file)

    assert.ok(parsed.length > 10)
  })
}
