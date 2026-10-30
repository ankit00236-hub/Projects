import test from 'node:test'
import assert from 'node:assert/strict'
import { pageFromHash, pages } from '../src/utils/navigation.js'
test('all integrated management and model tabs resolve; overview is the default', () => {
  for (const page of pages) assert.equal(pageFromHash(`#/${page}`), page)
  for (const hash of ['', '#/missing']) assert.equal(pageFromHash(hash), 'overview')
  assert.equal(pageFromHash('#/claims?filter=all'), 'claims')
})
