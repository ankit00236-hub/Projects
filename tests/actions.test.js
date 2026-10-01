import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readCases, rupees, exportCsv } from '../src/utils/actions.js'
const data = JSON.parse(readFileSync(new URL('../src/data/trainingData.json', import.meta.url)))
test('summary counts agree and raw records stay outside the JS bundle', () => {
  assert.equal(data.portfolio.reduce((sum, p) => sum + p.units, 0), data.summary.records)
  assert.equal(data.records, undefined)
  assert.match(rupees(123456), /₹1,23,456/)
})
test('corrupt case storage is reported instead of silently erased', () => {
  globalThis.localStorage = { getItem: () => '{broken' }
  assert.throws(readCases)
  localStorage.getItem = () => '[null]'
  assert.throws(readCases)
  const c = { id: '1', vehicle: 'Amaze', owner: 'Owner', claim: 'Clutch', status: 'Pending', amount: 2000 }
  localStorage.getItem = () => JSON.stringify([c])
  assert.deepEqual(readCases(), [c])
  localStorage.getItem = () => JSON.stringify([c, c])
  assert.throws(readCases)
})
test('CSV export quotes values and blocks spreadsheet formulas', async () => {
  let blob
  URL.createObjectURL = (value) => { blob = value; return 'blob:test' }
  URL.revokeObjectURL = () => {}
  globalThis.document = { body: { append() {} }, createElement: () => ({ click() {}, remove() {} }) }
  exportCsv([{ owner: '  =SUM(1,2)', amount: 2000, note: 'a"b' }], 'cases.csv')
  const csv = await blob.text()
  assert.match(csv, /"'  =SUM\(1,2\)"/)
  assert.match(csv, /"a""b"/)
  assert.throws(() => exportCsv([], 'empty.csv'))
})

test('regional and interval summaries cover every service record', () => {
  assert.equal(data.insights.regions.reduce((sum, r) => sum + r.records, 0), data.summary.records)
  assert.equal(data.insights.intervals.reduce((sum, r) => sum + r.records, 0), data.summary.records)
  const { min, median, p90, max } = data.insights.costs
  assert.ok(min <= median && median <= p90 && p90 <= max)
  assert.ok(data.insights.credit.below600 <= data.credit.records)
  assert.ok(data.insights.credit.withBounces <= data.credit.records)
})
