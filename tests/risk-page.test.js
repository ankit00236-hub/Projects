import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer as createHttpServer } from 'node:http'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let RiskPage
before(async () => {
  // An unbound HTTP server allows Vite to transform JSX without opening a port.
  server = await createServer({ server: { middlewareMode: true, ws: { server: createHttpServer() } }, appType: 'custom' })
  ;({ default: RiskPage } = await server.ssrLoadModule('/src/pages/RiskPage.jsx'))
})
after(async () => { await server?.close() })

const asset = {
  id: 'vehicle-1', registration: 'DL01AA1000', owner: 'Test Owner',
  service: { brand: 'honda', model: 'city' },
  monthlyIncome: 60000, existingEmi: 1000, overdueAmount: 2500,
  loan: { price: 1000000, down: 200000, rate: 8, months: 60 },
  policy: { start: '2025-01-01', end: '2027-01-01', maxMileage: 100000, claimLimit: 10000, components: ['engine_oil'] },
}
const cases = [
  { id: 'case-1', assetId: asset.id, owner: asset.owner, claimKey: 'engine_oil', claim: 'Engine Oil', claimDate: '2026-10-01', mileage: 25000, amount: 4000, status: 'Pending' },
  { id: 'case-2', owner: 'Legacy Owner', claim: 'Engine Oil', amount: 2000, status: 'Approved' },
]
const render = (props) => renderToStaticMarkup(React.createElement(RiskPage, props))

test('risk page separates original principal, overdue amounts and awaiting claims', () => {
  const html = render({ assets: [asset], cases, assessments: { 'case-1': { loading: true } } })
  assert.match(html, /Original financed principal/)
  assert.match(html, /₹8,00,000\.00/)
  assert.match(html, /₹2,500\.00/)
  assert.match(html, /₹4,000\.00/)
  assert.match(html, /0 errors · 1 running/)
  assert.match(html, /Incomplete, 1 records/)
  assert.doesNotMatch(html, /NaN/)
})

test('entered overdue balance does not change automatic policy screening', () => {
  for (const overdueAmount of [0, 2500, 500000]) {
    const html = render({ assets: [{ ...asset, overdueAmount }], cases })
    assert.match(html, /Ready for review, 1 records/)
    assert.match(html, /Financing is reviewed alongside the claim; it does not determine warranty coverage/)
  }
})

test('risk page includes a zero-baseline INR graph and accessible data tables', () => {
  const html = render({ assets: [asset], cases })
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby=/)
  assert.match(html, /₹0<\/text>/)
  assert.match(html, /Average cost \(INR\)/)
  assert.match(html, /View chart data/)
  assert.match(html, /5484|5,484/)
  assert.match(html, /No matching service models were found/)
})

test('risk page handles an empty workspace without inventing accounts', () => {
  const html = render({})
  assert.match(html, /Create a warranty case/)
  assert.match(html, /Register a vehicle/)
  assert.doesNotMatch(html, /NaN/)
})
