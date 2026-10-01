import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'

const memory = new Map()
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
globalThis.document = { documentElement: { dataset: { theme: 'light' } } }
globalThis.window = { location: { hash: '' } }
const server = await createServer({ server: { middlewareMode: true, ws: { server: createHttpServer() }, watch: null }, appType: 'custom' })
try {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  const checks = { overview: 'Protect every drive', warranty: 'Automatic warranty screening', financing: 'Connect warranty and financing', risk: 'Risk', reports: 'Warranty and financing cross-reference', notes: 'Desk notes', portfolio: 'Costs by model' }
  for (const [page, marker] of Object.entries(checks)) {
    window.location.hash = `#/${page}`
    const html = renderToString(createElement(App))
    assert.ok(html.includes(marker), `${page}: missing content`)
    if (page !== 'financing') assert.ok(!html.includes('Register vehicle &amp; policy'), `${page}: financing form leaked`)
    if (page !== 'notes') assert.ok(!html.includes('Add your first follow-up'), `${page}: notes leaked`)
  }
  const asset = { id: 'smoke-asset', owner: 'Smoke Owner', registration: 'TEST-ONLY', service: { brand: 'honda', model: 'jazz', engine_type: 'petrol', make_year: 2017, region: 'chennai', mileage_range: 10000, mileage: 11400 }, loan: { price: 800000, down: 160000, rate: 9, months: 60 }, monthlyIncome: 80000, existingEmi: 10000, overdueAmount: 1000, policy: { start: '2026-01-01', end: '2026-12-31', maxMileage: 100000, claimLimit: 10000, components: ['clutch'] } }
  const item = { id: 'smoke-case', assetId: asset.id, vehicle: 'Honda Jazz', owner: asset.owner, claimKey: 'clutch', claim: 'Clutch', claimDate: '2026-10-01', mileage: 11400, amount: 5000, status: 'Pending' }
  // These fixtures live only in the test's memory map, never in browser storage.
  memory.set('plutus-assets-v1', JSON.stringify([asset]))
  memory.set('plutus-cases', JSON.stringify([item]))
  for (const page of ['warranty', 'financing', 'risk', 'reports']) {
    window.location.hash = `#/${page}`
    const html = renderToString(createElement(App))
    assert.ok(!html.includes('NaN'), `${page}: invalid value rendered`)
    assert.ok(html.includes('Smoke Owner') || page === 'reports', `${page}: linked account was not rendered`)
  }
  console.log('All seven pages render independently; linked warranty/financing/risk/report fixtures render without invalid values.')
} finally { await server.close() }
