import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'

const memory = new Map()
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
globalThis.document = { documentElement: { dataset: { theme: 'light' } } }
globalThis.window = { location: { hash: '' } }
const evaluation = JSON.parse(readFileSync(new URL('../Data/processed/claims_model_evaluation.json', import.meta.url)))
const lines = readFileSync(new URL('../Data/warranty_claims.csv', import.meta.url), 'utf8').trim().split(/\r?\n/)
const fields = lines.shift().split(',')
const records = lines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [fields[index], ['fraud_flag', 'repair_cost_inr'].includes(fields[index]) ? Number(value) : value])))
const initialData = { evaluation, records, summary: { records: 500, flagged: 13, median_cost_inr: 260000, start: '2024-01-01', end: '2024-12-31' }, defects: [...new Set(records.map((r) => r.defect_code))], dealers: [...new Set(records.map((r) => r.dealer_id))] }
const server = await createServer({ server: { middlewareMode: true, ws: { server: createHttpServer() }, watch: null }, appType: 'custom' })
try {
  const { App } = await server.ssrLoadModule('/src/App.jsx')
  for (const [page, marker] of Object.entries({ overview: 'Protect every drive', warranty: 'Claim queue', financing: 'Connect warranty and financing', risk: 'Warranty and financing review', reports: 'Warranty and financing cross-reference', notes: 'Desk notes', portfolio: 'Vehicle warranty and financing portfolio', screening: 'Run claim screening', claims: 'Historical warranty claims', evaluation: 'Baseline check failed' })) {
    window.location.hash = `#/${page}`
    const html = renderToString(createElement(App, { initialData }))
    assert.ok(html.includes(marker), `${page}: missing content`)
    assert.ok(html.includes(`<div id="${page}-tab">`), `${page}: active tab is hidden`)
    for (const other of ['overview', 'warranty', 'financing', 'risk', 'reports', 'notes', 'portfolio', 'screening', 'claims', 'evaluation'].filter((item) => item !== page)) {
      assert.ok(html.includes(`<div id="${other}-tab" hidden="">`), `${page}: inactive ${other} tab is visible`)
    }
    assert.ok(!html.includes('NaN'), `${page}: invalid value rendered`)
    assert.ok(html.includes('href="#/financing"'), 'Financing navigation must remain available')
  }
  console.log('All ten management and model pages render with the correct active panel.')
} finally { await server.close() }
