import assert from 'node:assert/strict'
import test from 'node:test'
import { NarrationSession, narrationDocumentKey } from '../../../src/document/narration-session.js'

test('unknown narration documents start empty', () => {
  const session = new NarrationSession()
  assert.deepEqual(session.read('projects:astro'), {
    activated: false,
    currentTime: 0,
    duration: 0,
  })
})

test('narration positions are retained independently per document', () => {
  const session = new NarrationSession()
  session.update('projects:astro', { activated: true, currentTime: 222, duration: 490 })
  session.update('projects:cross-atro', { activated: true, currentTime: 41, duration: 305 })

  assert.deepEqual(session.read('projects:astro'), {
    activated: true,
    currentTime: 222,
    duration: 490,
  })
  assert.deepEqual(session.read('projects:cross-atro'), {
    activated: true,
    currentTime: 41,
    duration: 305,
  })
})

test('finished narration keeps activation but resets its position', () => {
  const session = new NarrationSession()
  session.update('projects:astro', { activated: true, currentTime: 490, duration: 490 })
  session.resetPosition('projects:astro')

  assert.deepEqual(session.read('projects:astro'), {
    activated: true,
    currentTime: 0,
    duration: 490,
  })
})

test('a new narration session has no retained state', () => {
  const previous = new NarrationSession()
  previous.update('projects:astro', { activated: true, currentTime: 222, duration: 490 })

  const fresh = new NarrationSession()
  assert.equal(fresh.read('projects:astro').currentTime, 0)
  assert.equal(fresh.read('projects:astro').activated, false)
})

test('narration document keys include route and document identity', () => {
  assert.equal(narrationDocumentKey('projects', { id: 'astro' }), 'projects:astro')
  assert.equal(narrationDocumentKey('articles', { id: 'astro' }), 'articles:astro')
})
