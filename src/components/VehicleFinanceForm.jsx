import { useState } from 'react'
import data from '../data/vehicleOptions.json'
import { loanEstimate } from '../utils/finance'
import { componentLabel, currentDate } from '../utils/warranty'

export default function VehicleFinanceForm({ assets, onSave }) {
  const [error, setError] = useState('')
  const [editing, setEditing] = useState('')
  const [formVersion, setFormVersion] = useState(0)
  const asset = assets.find((a) => a.id === editing)
  function edit(id) {
    const value = assets.find((a) => a.id === id)
    setEditing(value?.id || ''); setFormVersion((v) => v + 1)
  }
  async function submit(event) {
    event.preventDefault()
    const input = new FormData(event.currentTarget)
    const number = (key) => Number(input.get(key))
    const loan = { price: number('price'), down: number('down'), rate: number('rate'), months: number('months') }
    const policy = { start: input.get('start'), end: input.get('end'), maxMileage: number('maxMileage'), claimLimit: number('claimLimit'), components: input.getAll('components') }
    const registration = input.get('registration').trim().toUpperCase()
    if (!loanEstimate(loan) || policy.start > policy.end || !policy.components.length || assets.some((a) => a.id !== editing && a.registration === registration)) {
      setError('Check loan terms, coverage dates and components. Vehicle registration must be unique.'); return
    }
    const monthlyIncome = number('monthlyIncome'), existingEmi = number('existingEmi'), overdueAmount = number('overdueAmount')
    if (![policy.maxMileage, policy.claimLimit, monthlyIncome, existingEmi, overdueAmount].every(Number.isFinite) || policy.maxMileage < 0 || policy.claimLimit <= 0 || monthlyIncome <= 0 || existingEmi < 0 || overdueAmount < 0 || !registration || !input.get('owner').trim()) {
      setError('Enter valid positive coverage limits and income, and nonnegative obligations.'); return
    }
    const next = { id: editing || crypto.randomUUID(), owner: input.get('owner').trim(), registration, service: { ...data.initialForm, brand: input.get('brand').trim(), model: input.get('model').trim(), engine_type: input.get('engine_type').trim(), region: input.get('region').trim(), make_year: number('make_year'), mileage_range: number('interval'), mileage: number('mileage') }, loan, policy, monthlyIncome, existingEmi, overdueAmount, updated: new Date().toISOString() }
    try {
      await onSave(editing ? assets.map((a) => a.id === editing ? next : a) : [...assets, next])
      setError(''); setEditing(''); setFormVersion((v) => v + 1)
    } catch (failure) { setError(failure.message) }
  }
  return <article className="panel panel-large"><div className="panel-header"><div><p className="eyebrow accent">Shared vehicle record</p><h3>Connect warranty and financing</h3></div></div><p className="subcopy">Enter the vehicle, loan, and actual policy terms. Both workspaces use this record; credit training rows are never assigned to a customer.</p><label className="queue-filter">Edit record<select value={editing} onChange={(e) => edit(e.target.value)}><option value="">Create a new vehicle</option>{assets.map((a) => <option value={a.id} key={a.id}>{a.registration} · {a.owner}</option>)}</select></label>
    <form key={formVersion} onSubmit={submit} className="page-stack"><div className="prediction-form">
      <label>Owner<input name="owner" required maxLength="120" defaultValue={asset?.owner} /></label>
      <label>Registration / vehicle ID<input name="registration" required maxLength="40" defaultValue={asset?.registration} /></label>
      {['brand', 'model', 'engine_type', 'region'].map((key) => <label key={key}>{componentLabel(key)}<input name={key} required maxLength="80" defaultValue={asset?.service[key] || ''} /></label>)}
      <label>Vehicle year<input name="make_year" type="number" required min="1900" max="2100" step="1" defaultValue={asset?.service.make_year} /></label>
      <label>Current mileage (km)<input name="mileage" type="number" required min="0" step="1" defaultValue={asset?.service.mileage ?? 0} /></label>
      <label>Service interval (km)<select name="interval" defaultValue={asset?.service.mileage_range || 10000}>{data.mileageRanges.map((v) => <option key={v}>{v}</option>)}</select></label>
      {[['price', 'Vehicle price (₹)', 1, asset?.loan.price], ['down', 'Down payment (₹)', 0, asset?.loan.down], ['rate', 'Annual rate (%)', 0, asset?.loan.rate], ['months', 'Tenure (months)', 1, asset?.loan.months], ['monthlyIncome', 'Monthly income (₹)', 1, asset?.monthlyIncome], ['existingEmi', 'Other monthly EMI (₹)', 0, asset?.existingEmi ?? 0], ['overdueAmount', 'Overdue amount (₹)', 0, asset?.overdueAmount ?? 0], ['maxMileage', 'Policy mileage limit (km)', 0, asset?.policy.maxMileage], ['claimLimit', 'Policy per-claim limit (₹)', 1, asset?.policy.claimLimit]].map(([key, label, min, value]) => <label key={key}>{label}<input required name={key} type="number" min={min} step={['months', 'maxMileage'].includes(key) ? 1 : '0.01'} defaultValue={value} /></label>)}
      <label>Coverage begins<input required type="date" name="start" defaultValue={asset?.policy.start || currentDate()} /></label><label>Coverage ends<input required type="date" name="end" defaultValue={asset?.policy.end} /></label>
    </div><fieldset className="component-options"><legend>Covered policy components</legend>{data.flags.map((key) => <label key={key}><input type="checkbox" name="components" value={key} defaultChecked={asset?.policy.components.includes(key) || false} />{componentLabel(key)}</label>)}</fieldset>{error && <p className="prediction-error" role="alert">{error}</p>}<button className="primary-button" type="submit">{editing ? 'Update shared record' : 'Register vehicle & policy'}</button></form>
    <p className="chart-caption subcopy">{assets.length} registered vehicles. Monetary fields use INR; changes re-run the warranty checks automatically.</p>
  </article>
}
