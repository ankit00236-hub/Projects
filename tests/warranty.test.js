import test from 'node:test'
import assert from 'node:assert/strict'
import { screenWarranty, financeSummary, assessmentService } from '../src/utils/warranty.js'
const asset = { id: 'a', owner: 'Owner', registration: 'MH-TEST', service: { brand: 'honda', model: 'jazz', engine_type: 'petrol', make_year: 2017, region: 'chennai', mileage_range: 10000, mileage: 11400 }, loan: { price: 800000, down: 160000, rate: 9, months: 60 }, monthlyIncome: 80000, existingEmi: 10000, overdueAmount: 1000, policy: { start: '2026-01-01', end: '2026-12-31', maxMileage: 100000, claimLimit: 10000, components: ['clutch'] } }
const item = { id: 'c', assetId: 'a', owner: 'Owner', claimKey: 'clutch', claim: 'Clutch', amount: 5000, mileage: 11400, claimDate: '2026-10-01' }
test('automatic policy checks honor inclusive date, mileage, and claim limits', () => {
  assert.equal(screenWarranty(item, [asset]).state, 'Ready for review')
  assert.equal(screenWarranty({ ...item, claimDate: '2026-12-31', mileage: 100000, amount: 10000 }, [asset]).state, 'Ready for review')
  for (const change of [{ claimDate: '2027-01-01' }, { mileage: -1 }, { mileage: 100001 }, { amount: 10001 }, { claimKey: 'brake_pads' }, { owner: 'Other owner' }]) {
    assert.equal(screenWarranty({ ...item, ...change }, [asset]).state, 'Needs attention')
  }
})
test('missing links and duplicate submissions are explicit review reasons', () => {
  assert.equal(screenWarranty(item, []).state, 'Incomplete')
  const result = screenWarranty(item, [asset], [item, { ...item, id: 'other' }])
  assert.equal(result.state, 'Needs attention')
  assert.equal(result.checks.find((c) => c.name === 'Duplicate submission').ok, false)
})
test('financing stays parallel to coverage and computes obligations correctly', () => {
  const summary = financeSummary(asset)
  assert.ok(Math.abs(summary.monthlyObligationRatio - (13285.34 + 10000) / 80000 * 100) < 0.001)
  assert.equal(screenWarranty(item, [{ ...asset, overdueAmount: 99999 }]).state, 'Ready for review')
  assert.equal(screenWarranty(item, [{ ...asset, policy: { ...asset.policy, claimLimit: 100 } }]).state, 'Needs attention')
})
test('model cross-reference uses the linked vehicle and selected component', () => {
  const result = assessmentService(item, asset, ['clutch', 'brake_pads'])
  assert.equal(result.clutch, 1)
  assert.equal(result.brake_pads, 0)
  assert.equal(result.mileage, 11400)
  assert.equal(result.model, 'jazz')
})

test('damaged policy and duplicate vehicle IDs cannot silently enter the register', async () => {
  const { validateVehicles } = await import('../src/utils/vehicleRecords.js')
  assert.equal(validateVehicles([asset]).length, 1)
  assert.throws(() => validateVehicles([asset, asset]))
  assert.throws(() => validateVehicles([{ ...asset, policy: { ...asset.policy, end: '2026-02-30' } }]))
  assert.throws(() => validateVehicles([{ ...asset, monthlyIncome: -1 }]))
  assert.throws(() => validateVehicles([{ ...asset, policy: { ...asset.policy, claimLimit: NaN } }]))
})
