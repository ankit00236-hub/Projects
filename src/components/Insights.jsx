import { useState } from 'react'
import data from '../data/trainingData.json'
import { rupees, title } from '../utils/actions'

const count = (value) => value.toLocaleString('en-IN')
function Heading({ eyebrow, children }) {
  return <div className="panel-header"><div><p className="eyebrow accent">{eyebrow}</p><h3>{children}</h3></div></div>
}
export function OverviewInsights({ cases }) {
  const approved = cases.filter((c) => c.status === 'Approved').length
  return <section className="insight-grid" aria-label="Overview insights">
    <article className="panel panel-large"><Heading eyebrow="Service footprint">Where your records come from</Heading><div className="region-cards">{data.insights.regions.map((r) => <div className="insight-tile" key={r.region}><span>{title(r.region)}</span><strong>{count(r.records)} <small>records</small></strong><div className="progress-track"><span className="progress-bar green" style={{ width: `${r.records / data.summary.records * 100}%` }} /></div><p>{rupees(r.average)} average service cost</p></div>)}</div></article>
    <article className="panel panel-large"><Heading eyebrow="Cost distribution">Know the typical service bill</Heading><div className="metric-pair"><div><span>Median service cost</span><strong>{rupees(data.insights.costs.median)}</strong></div><div><span>90th percentile</span><strong>{rupees(data.insights.costs.p90)}</strong></div></div><p className="subcopy">90% of training service bills fall at or below the 90th percentile. Observed range: {rupees(data.insights.costs.min)}–{rupees(data.insights.costs.max)}.</p></article>
    <article className="panel panel-large"><Heading eyebrow="Your case activity">Warranty snapshot</Heading><div className="metric-pair"><div><span>Total cases</span><strong>{count(cases.length)}</strong></div><div><span>Approved</span><strong>{count(approved)}</strong></div></div><div className="status-summary">{['Pending', 'Review', 'Approved', 'Rejected'].map((status) => <span key={status}>{status}<b>{cases.filter((c) => c.status === status).length}</b></span>)}</div><p className="subcopy">Live totals from cases saved in this browser.</p></article>
  </section>
}
export function RiskInsights({ cases }) {
  const [view, setView] = useState('components')
  const credit = data.insights.credit
  const pending = cases.filter((c) => ['Pending', 'Review'].includes(c.status))
  const mostExpensive = [...data.portfolio].sort((a, b) => b.average - a.average)[0]
  return <article className="panel panel-large" id="risk">
    <Heading eyebrow="Risk & maintenance">Exposure at a glance</Heading>
    <div className="risk-metrics"><div className="insight-tile"><span>Open case amount</span><strong>{rupees(pending.reduce((sum, c) => sum + c.amount, 0))}</strong><p>{pending.length} pending or under review</p></div><div className="insight-tile"><span>Credit scores below 600</span><strong>{count(credit.below600)}</strong><p>{(credit.below600 / data.credit.records * 100).toFixed(1)}% of credit records</p></div><div className="insight-tile"><span>Records with payment bounces</span><strong>{count(credit.withBounces)}</strong><p>At least one recorded bounce</p></div></div>
    <p className="insight-note">{title(mostExpensive.model)} has the highest average service cost ({rupees(mostExpensive.average)}). Average obligation-to-income ratio in the credit dataset: {credit.averageObligationRatio}%.</p>
    <div className="view-switch" role="group" aria-label="Maintenance chart">{['components', 'intervals'].map((v) => <button type="button" aria-pressed={view === v} className={view === v ? 'primary-button small' : 'ghost-button small'} onClick={() => setView(v)} key={v}>{v === 'components' ? 'Service components' : 'Service intervals'}</button>)}</div>
    {view === 'components' ? <div className="coverage-list">{[...data.components].sort((a, b) => b.value - a.value).map((c) => <div className="coverage-row" key={c.key}><span>{title(c.name.replace('whell', 'wheel'))}</span><div className="coverage-bar-wrap"><span className="coverage-bar" style={{ width: `${c.value}%`, background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-green))' }} /></div><strong>{c.value}%</strong></div>)}</div> : <div className="table-wrap"><table><thead><tr><th>Interval (km)</th><th>Records</th><th>Average cost</th></tr></thead><tbody>{data.insights.intervals.map((r) => <tr key={r.interval}><td>{count(r.interval)}</td><td>{count(r.records)}</td><td>{rupees(r.average)}</td></tr>)}</tbody></table></div>}
    <p className="subcopy chart-caption">Dataset indicators describe historical records; they are not individual credit or warranty risk predictions.</p>
  </article>
}
export function ReportsPanel({ cases, download, downloadServices }) {
  const [status, setStatus] = useState('All')
  const selected = cases.filter((c) => status === 'All' || c.status === status)
  const reports = [
    ['Service records', `${count(data.summary.records)} rows · vehicle details & INR costs`, downloadServices],
    ['Model portfolio', '4 models · record counts & average costs', () => download(data.portfolio, 'portfolio-INR.csv')],
    ['Regional summary', 'Chennai & Mumbai · service costs', () => download(data.insights.regions, 'regions-INR.csv')],
    ['Service intervals', '9 intervals · record counts & costs', () => download(data.insights.intervals, 'service-intervals-INR.csv')],
    ['Maintenance frequency', '12 components · frequency percentages', () => download(data.components, 'maintenance-frequency.csv')],
  ]
  return <aside className="panel task-panel" id="reports"><Heading eyebrow="Reports & exports">Your reporting desk</Heading><p className="subcopy">Download focused summaries or full service records. All monetary fields use INR.</p><div className="report-catalog">{reports.map(([name, description, action]) => <div className="report-row" key={name}><div><strong>{name}</strong><span>{description}</span></div><button type="button" className="ghost-button small" onClick={action} aria-label={`Download ${name}`}>CSV ↓</button></div>)}</div><div className="case-report"><h4>Warranty case report</h4><label className="queue-filter">Include<select value={status} onChange={(e) => setStatus(e.target.value)}>{['All', 'Pending', 'Review', 'Approved', 'Rejected'].map((v) => <option key={v}>{v}</option>)}</select></label><div className="metric-pair"><div><span>Matching cases</span><strong>{selected.length}</strong></div><div><span>Requested amount</span><strong>{rupees(selected.reduce((sum, c) => sum + c.amount, 0))}</strong></div></div><button type="button" className="primary-button" disabled={!selected.length} onClick={() => download(selected, `warranty-${status.toLowerCase()}-INR.csv`)}>Export selected cases</button>{!selected.length && <p className="subcopy chart-caption">No cases match this filter.</p>}</div></aside>
}
