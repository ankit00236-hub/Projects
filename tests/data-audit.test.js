import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../Data/warranty_claims.csv', import.meta.url))
const report = JSON.parse(readFileSync(new URL('../Data/processed/claims_model_evaluation.json', import.meta.url)))
test('active model report fingerprints the uploaded dataset and exposes limitations', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), report.sha256)
  assert.equal(report.rows, 500)
  assert.equal(report.flagged, 13)
  assert.equal(report.training_rows + report.holdout_rows, report.rows)
  assert.equal(report.training_flagged + report.holdout_flagged, report.flagged)
  assert.ok(!report.features.includes('approved'))
  assert.ok(!report.features.includes('fraud_flag'))
  assert.equal(report.status, 'experimental_only')
  assert.equal(report.beats_baseline, false)
  assert.equal(report.holdout.confusion_matrix.flat().reduce((a, b) => a + b, 0), report.holdout_rows)
})
