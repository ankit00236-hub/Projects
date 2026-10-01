import test from 'node:test'
import assert from 'node:assert/strict'
import { pageFromHash } from '../src/utils/navigation.js'
test('each workspace has a direct route and supports old bookmarks', () => {
  for (const page of ['overview', 'warranty', 'financing', 'risk', 'reports', 'notes', 'portfolio']) {
    assert.equal(pageFromHash(`#/${page}`), page)
    assert.equal(pageFromHash(`#${page}`), page)
  }
})
test('empty and unknown routes safely open overview', () => {
  for (const hash of ['', '#/', '#/missing', '#/warranty/unknown']) assert.equal(pageFromHash(hash), 'overview')
})
