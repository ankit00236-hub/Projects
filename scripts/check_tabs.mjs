// Browser integration checks using an already running local app and Chrome CDP.
// Run against an isolated backend database; this creates a disposable test account.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.PLUTUS_TEST_URL || 'http://127.0.0.1:5173'
const cdp = process.env.PLUTUS_CDP_URL || 'http://127.0.0.1:9222'
const tabs = await (await fetch(`${cdp}/json/list`)).json()
const tab = tabs.find((item) => item.type === 'page' && (item.url.startsWith(base) || item.url === 'about:blank' || item.url.startsWith('http://127.0.0.1:5173')))
assert.ok(tab, 'Open a blank page in Chrome with remote debugging enabled')
const socket = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
let sequence = 0
const pending = new Map(), errors = [], checks = []
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  if (!message.id) return
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id); clearTimeout(request.timer)
  if (message.error) request.reject(new Error(JSON.stringify(message.error)))
  else request.resolve(message.result)
})
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function wait(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if (await evaluate(expression)) return } catch (error) { if (!/context|navigat/i.test(error.message)) throw error }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Condition timed out: ${expression}\n${await evaluate('document.body.innerText')}`)
}
async function reloadPage() {
  const previous = await evaluate('performance.timeOrigin')
  await call('Page.reload')
  await wait(`performance.timeOrigin !== ${previous} && document.readyState === 'complete'`)
}
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
async function input(selector, value) {
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); })()`)
}
async function navigate(page) {
  await evaluate(`(document.querySelector('.main-nav a[href="#/${page}"]') || document.querySelector('.model-tools-nav a[href="#/${page}"]')).click()`)
  await wait(`!!document.getElementById('${page}-tab') && !document.getElementById('${page}-tab').hidden`)
}
function passed(name) { checks.push(name); console.log(`PASS ${name}`) }

try {
  await call('Runtime.enable'); await call('Network.enable')
  await call('Page.navigate', { url: base })
  await wait('!!document.querySelector(".auth-page, .claims-workspace")')
  if (await evaluate('!!document.querySelector(".account-bar")')) await click('.account-bar button')
  await wait('!!document.querySelector(".auth-switch")')
  await click('.auth-switch')
  const username = `tabs_${Date.now()}`, password = 'browser-check-password-123'
  await input('#account-username', username); await input('#account-password', password)
  await click('.auth-submit')
  await wait('!!document.querySelector(".claims-fields")')
  assert.ok(await evaluate('document.querySelector(".hero-panel").innerText.includes("Finance the journey")'))
  passed('Registration → integrated overview and account workspace')

  await navigate('financing')
  for (const [name, value] of Object.entries({ owner: 'Integration Test Owner', registration: `TEST-${Date.now()}`, brand: 'Maruti', model: 'Swift', engine_type: 'petrol', region: 'Delhi', make_year: '2024', mileage: '12000', price: '800000', down: '160000', rate: '9', months: '60', monthlyIncome: '80000', existingEmi: '1000', overdueAmount: '2500', maxMileage: '100000', claimLimit: '500000', start: '2024-01-01', end: '2028-12-31' })) {
    await input(`#financing-tab [name="${name}"]`, value)
  }
  await click('#financing-tab input[name="components"][value="brake_pads"]')
  await click('#financing-tab form button[type="submit"]')
  await wait('document.querySelector("#financing-tab").innerText.includes("1 registered vehicles")')
  await navigate('portfolio')
  assert.ok(await evaluate('document.querySelector("#portfolio-tab").innerText.includes("Swift")'))
  await click('#portfolio-tab tbody button')
  await wait('!document.getElementById("warranty-tab").hidden')
  await click('.header-actions .primary-button')
  await wait('!!document.querySelector("dialog[open]")')
  for (const [name, value] of Object.entries({ component: 'brake_pads', defect_code: 'Brake_Pad', dealer_id: 'DLR01', claimDate: '2024-11-17', mileage: '12000', amount: '44657' })) await input(`dialog [name="${name}"]`, value)
  await click('dialog button[type="submit"]')
  await wait('!document.querySelector("dialog[open]") && !!document.querySelector("#warranty-tab .case-checks")')
  await click('#warranty-tab .case-checks summary')
  await wait('document.querySelector("#warranty-tab").innerText.includes("Experimental fraud model score")')
  assert.ok(await evaluate('document.querySelector("#warranty-tab").innerText.includes("Linked financing")'))
  assert.ok(await evaluate('document.querySelector("#warranty-tab").innerText.includes("Ready for review")'))
  await input('#warranty-tab select[aria-label="Status for Integration Test Owner"]', 'Approved')
  await wait('document.querySelector(".notice")?.textContent === "Staff decision saved."')
  await navigate('reports')
  assert.equal(await evaluate('document.querySelector("#reports-tab .primary-button").disabled'), false)
  await navigate('notes')
  await input('#notes-tab textarea', 'Request invoice for linked warranty and financing account')
  await click('#notes-tab .note-form button')
  await wait('document.querySelector("#notes-tab .desk-note")?.textContent.includes("Request invoice")')
  await reloadPage()
  await wait('!!document.querySelector("#notes-tab .desk-note")')
  await navigate('warranty')
  assert.equal(await evaluate(`document.querySelector('#warranty-tab select[aria-label="Status for Integration Test Owner"]').value`), 'Approved')
  await navigate('financing')
  assert.ok(await evaluate('document.querySelector("#financing-tab").innerText.includes("Integration Test Owner")'))
  const assetId = await evaluate('document.querySelector("#financing-tab .queue-filter select option:nth-child(2)").value')
  await input('#financing-tab .queue-filter select', assetId)
  await input('#financing-tab [name="maxMileage"]', '5000')
  await input('#financing-tab [name="overdueAmount"]', '0')
  await click('#financing-tab form button[type="submit"]')
  await wait('document.querySelector("#financing-tab .queue-filter select").value === ""')
  await navigate('warranty')
  assert.ok(await evaluate('document.querySelector("#warranty-tab .case-checks summary").textContent.startsWith("Needs attention")'))
  assert.equal(await evaluate(`document.querySelector('#warranty-tab select[aria-label="Status for Integration Test Owner"]').value`), 'Approved')
  await navigate('financing')
  await input('#financing-tab .queue-filter select', assetId)
  await input('#financing-tab [name="maxMileage"]', '100000')
  await click('#financing-tab form button[type="submit"]')
  await wait('document.querySelector("#financing-tab .queue-filter select").value === ""')
  await navigate('warranty')
  assert.ok(await evaluate('document.querySelector("#warranty-tab .case-checks summary").textContent.startsWith("Ready for review")'))
  passed('Vehicle/loan/policy registration → portfolio → linked warranty → automatic fraud check → staff decision → reports and notes → refresh persistence')

  await navigate('claims')
  assert.equal(await evaluate('document.querySelector("#claims-tab .claims-table caption").textContent'), '500 matching claims · amounts in INR')
  await click('.claims-pagination button:last-child')
  await wait('document.querySelector(".claims-pagination span").textContent === "Page 2 of 25"')
  await input('input[type="search"]', 'CLM00001')
  await wait('document.querySelector("#claims-tab .claims-table caption").textContent.startsWith("1 matching")')
  assert.equal(await evaluate('document.querySelector(".claims-pagination span").textContent'), 'Page 1 of 1')
  await input('input[type="search"]', '')
  await input('.claims-filters select', '1')
  await wait('document.querySelector("#claims-tab .claims-table caption").textContent.startsWith("13 matching")')
  assert.equal(await evaluate('document.querySelectorAll("#claims-tab .claims-table tbody tr").length'), 13)
  passed('Claim history search + fraud filter + pagination reset')

  await evaluate(`window.__lastExport = null; window.__originalObjectURL = URL.createObjectURL; URL.createObjectURL = (blob) => { window.__lastExport = blob; return window.__originalObjectURL(blob) }; document.addEventListener('click', (event) => { if (event.target.tagName === 'A' && event.target.download) event.preventDefault() }, true)`)
  await click('.claims-section-heading button')
  const csv = await evaluate('window.__lastExport.text()')
  assert.equal(csv.trim().split(/\r?\n/).length, 14)
  assert.ok(csv.includes('"fraud_flag"'))
  passed('Filtered CSV export contains exactly the 13 flagged records')
  await navigate('reports')
  await click('#reports-tab .primary-button')
  const linkedCsv = await evaluate('window.__lastExport.text()')
  assert.ok(linkedCsv.includes('"experimental_model_score"'))
  assert.ok(linkedCsv.includes('"Integration Test Owner"'))
  assert.ok(linkedCsv.includes('"Approved"'))
  assert.ok(linkedCsv.includes('"monthly_emi_inr"'))
  assert.ok(!linkedCsv.includes('NaN'))
  passed('Integrated report exports staff decision, policy checks, model score and financing for the same linked claim')


  await navigate('evaluation')
  assert.ok(await evaluate('document.querySelector("main").innerText.includes("Baseline check failed")'))
  await click('#evaluation-tab details summary')
  assert.equal(await evaluate('document.querySelector("#evaluation-tab details").open'), true)
  await navigate('claims')
  assert.equal(await evaluate('document.querySelector(".claims-filters select").value'), '1')
  assert.equal(await evaluate('document.querySelector("#claims-tab .claims-table caption").textContent'), '13 matching claims · amounts in INR')
  passed('Evaluation tab + expandable evidence + retained history filter')

  const selectedId = await evaluate('document.querySelector("#claims-tab .claims-table tbody th").textContent')
  await click('#claims-tab .claims-table tbody button')
  await wait('document.querySelector(".model-tools-nav a[aria-current=page]").getAttribute("href") === "#/screening"')
  assert.ok(await evaluate(`document.querySelector('.claims-fields').parentElement.innerText.includes(${JSON.stringify(selectedId)})`))
  const loadedCost = await evaluate('document.querySelector(".claims-fields input[type=number]").value')
  await click('.claims-fields + button')
  await wait('!!document.querySelector(".claims-score")')
  assert.ok(await evaluate('document.querySelector(".claims-result").innerText.includes("Manual review required")'))
  const score = await evaluate('document.querySelector(".claims-score strong").textContent')
  passed('History → selected claim details → real backend model inference')

  await click('[data-action="view-evaluation"]')
  await wait('document.querySelector(".model-tools-nav a[aria-current=page]").getAttribute("href") === "#/evaluation"')
  await evaluate('history.back()')
  await wait('document.querySelector(".model-tools-nav a[aria-current=page]").getAttribute("href") === "#/screening"')
  assert.equal(await evaluate('document.querySelector(".claims-score strong").textContent'), score)
  assert.equal(await evaluate('document.querySelector(".claims-fields input[type=number]").value'), loadedCost)
  await evaluate('history.forward()')
  await wait('document.querySelector(".model-tools-nav a[aria-current=page]").getAttribute("href") === "#/evaluation"')
  passed('View evaluation link + browser back/forward preserve screening inputs and result')

  await navigate('screening')
  await input('.claims-fields input[type=number]', '12345')
  assert.equal(await evaluate('!!document.querySelector(".claims-score")'), false)
  await evaluate(`window.__realFetch = window.fetch; window.fetch = (url, ...args) => String(url).endsWith('/screen-claim') ? Promise.reject(new TypeError('Simulated offline check')) : window.__realFetch(url, ...args)`)
  await click('.claims-fields + button')
  await wait('!!document.querySelector(".prediction-error")')
  await evaluate('window.fetch = window.__realFetch')
  await click('.claims-fields + button')
  await wait('!!document.querySelector(".claims-score")')
  await input('.claims-fields input[type=number]', '0')
  assert.equal(await evaluate('document.querySelector(".claims-fields input[type=number]").checkValidity()'), false)
  await input('.claims-fields input[type=number]', '12345')
  passed('Edited inputs clear stale score; screening error recovers; invalid amount blocked')

  const theme = await evaluate('document.documentElement.dataset.theme')
  await click('.theme-toggle')
  assert.notEqual(await evaluate('document.documentElement.dataset.theme'), theme)
  const nextTheme = await evaluate('document.documentElement.dataset.theme')
  await navigate('claims')
  await reloadPage()
  await wait('!!document.querySelector(".claims-fields")')
  assert.equal(await evaluate('document.querySelector(".model-tools-nav a[aria-current=page]").getAttribute("href")'), '#/claims')
  assert.equal(await evaluate('document.documentElement.dataset.theme'), nextTheme)
  passed('Direct tab URL, refresh, account session, and theme persistence')

  for (const width of [1440, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
    for (const page of ['overview', 'warranty', 'financing', 'risk', 'reports', 'notes', 'portfolio', 'screening', 'claims', 'evaluation']) {
      await navigate(page)
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `Page overflow at ${width}px on ${page}`)
      assert.equal(await evaluate('Array.from(document.querySelectorAll("main > div[hidden]")).every(element => getComputedStyle(element).display === "none")'), true)
    }
  }
  await mkdir('/private/tmp/plutus-tab-evidence', { recursive: true })
  const screenshot = await call('Page.captureScreenshot', { format: 'png' })
  await writeFile('/private/tmp/plutus-tab-evidence/evaluation-mobile.png', Buffer.from(screenshot.data, 'base64'))
  await call('Emulation.clearDeviceMetricsOverride')
  passed('All ten tabs visible and contained at desktop and mobile widths')

  await navigate('screening')
  await call('Network.setBlockedURLs', { urls: ['*/api/claims-data'] })
  await reloadPage()
  await wait('!!document.querySelector(".claims-workspace [role=alert]")')
  await call('Network.setBlockedURLs', { urls: [] })
  await click('.claims-workspace [role=alert] button')
  await wait('!!document.querySelector(".claims-fields")')
  passed('Dataset load failure → retry → restored workspace')

  await click('.account-bar button')
  await wait('!!document.querySelector(".auth-form")')
  await input('#account-username', username); await input('#account-password', password)
  await click('.auth-submit')
  await wait('!!document.querySelector(".claims-fields")')
  passed('Sign out → sign in restores access')

  await navigate('overview')
  await wait(`!document.querySelector('[data-action="load-demo"]').disabled`)
  await click('[data-action="load-demo"]')
  await wait('document.querySelector(".notice")?.textContent.includes("added 6 vehicles, 10 warranty cases, and 6 follow-ups")')
  assert.equal(await evaluate('document.querySelector("#overview-tab .stat-card strong").textContent'), '7')
  assert.ok(await evaluate('document.querySelector(".demo-banner").textContent.includes("6 vehicles, 10 claims, 6 follow-ups")'))
  await click('[data-action="load-demo"]')
  await wait('document.querySelector(".notice")?.textContent.includes("added 0 vehicles, 0 warranty cases, and 0 follow-ups")')
  assert.equal(await evaluate('document.querySelector("#overview-tab .stat-card strong").textContent'), '7')
  await navigate('warranty')
  assert.ok(await evaluate('document.querySelector("#warranty-tab").textContent.includes("Claim queue (11)")'))
  await navigate('portfolio')
  assert.equal(await evaluate('document.querySelectorAll("#portfolio-tab tbody tr").length'), 7)
  await navigate('notes')
  assert.equal(await evaluate('document.querySelectorAll("#notes-tab .desk-note").length'), 7)
  await reloadPage()
  await wait('document.querySelectorAll("#notes-tab .desk-note").length === 7')
  passed('Demo examples fill overview, portfolio, warranty and notes; preserve real records; repeat without duplicates; persist after refresh')

  assert.deepEqual(errors, [], 'Uncaught browser JavaScript errors')
  console.log(`\n${checks.length} browser integration checks passed; no uncaught JavaScript errors.`)
} finally {
  await call('Network.setBlockedURLs', { urls: [] }).catch(() => {})
  socket.close()
}
