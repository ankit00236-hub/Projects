import test from 'node:test'
import assert from 'node:assert/strict'
import { loanEstimate } from '../src/utils/finance.js'
test('fixed-rate loan estimate matches expected EMI and totals', () => {
  const result = loanEstimate({ price: 800000, down: 160000, rate: 9, months: 60 })
  assert.ok(Math.abs(result.emi - 13285.34) < 0.01)
  assert.equal(result.total, result.emi * 60)
  assert.equal(result.principal, 640000)
})
test('zero interest and invalid loan inputs', () => {
  assert.equal(loanEstimate({ price: 120000, down: 0, rate: 0, months: 12 }).emi, 10000)
  for (const change of [{ down: 120000 }, { rate: -1 }, { months: 0 }, { months: 1.5 }, { price: '' }, { price: Infinity }]) {
    assert.equal(loanEstimate({ price: 120000, down: 0, rate: 0, months: 12, ...change }), null)
  }
})
