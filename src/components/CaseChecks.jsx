import { useState } from 'react'
import data from '../data/trainingData.json'
import { screenWarranty, financeSummary, vehicleLabel, componentLabel, currentDate } from '../utils/warranty'
import { rupees } from '../utils/actions'

export default function CaseChecks({ item, assets, cases, model, onLink }) {
  const [error, setError] = useState('')
  const result = screenWarranty(item, assets, cases)
  const finance = result.asset ? financeSummary(result.asset) : null
  function link(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try { onLink(item.id, { assetId: form.get('assetId'), claimKey: form.get('component'), claim: componentLabel(form.get('component')), claimDate: form.get('claimDate'), mileage: Number(form.get('mileage')) }); setError('') }
    catch (failure) { setError(failure.message) }
  }
  return <details className="case-checks"><summary>{result.state} · {model?.loading ? 'model checking…' : model?.data ? (model.data.triage === 'review' ? 'cost review suggested' : 'cost checked') : 'model not checked'}</summary>
    <ul className="check-list">{result.checks.map((check) => <li key={check.name}><b className={check.ok ? 'check-pass' : 'check-attention'}>{check.ok ? '✓' : '!'} {check.name}</b><span>{check.detail}</span></li>)}</ul>
    {finance && <div className="insight-note"><strong>Linked financing: {result.asset.registration}</strong><p>EMI {rupees(finance.emi)} · outstanding overdue {rupees(result.asset.overdueAmount)}{finance.monthlyObligationRatio !== null && ` · monthly obligations ${finance.monthlyObligationRatio.toFixed(1)}% of entered income`}</p><p>Financing facts are shown in parallel; overdue balances do not determine warranty coverage.</p></div>}
    {model?.data && <div className="metric-pair"><div><span>Service model estimate</span><strong>{rupees(model.data.predicted_service_cost)}</strong></div><div><span>Component price reference</span><strong>{model.data.reference_cost == null ? 'No matched price' : rupees(model.data.reference_cost)}</strong></div><div><span>Scheduled package reference</span><strong>{model.data.scheduled_reference_cost == null ? 'No matched schedule' : rupees(model.data.scheduled_reference_cost)}</strong></div><p className="subcopy">{model.data.reference_provenance?.scope}</p><p className="subcopy">{model.data.reasons?.join(' ')}</p><p className="subcopy">Service estimates describe maintenance, and component references exclude labour. Neither is a coverage entitlement.</p></div>}
    {model?.error && <p role="status" className="prediction-error">{model.error}</p>}
    {!result.asset && assets.length > 0 && <form onSubmit={link} className="page-stack"><p className="subcopy">Complete the link for this previously saved case.</p><div className="prediction-form"><label>Vehicle<select name="assetId">{assets.map((a) => <option key={a.id} value={a.id}>{vehicleLabel(a)}</option>)}</select></label><label>Component<select name="component" defaultValue={item.claimKey || data.flags.find((k) => componentLabel(k).toLowerCase() === item.claim.toLowerCase())}>{data.flags.map((key) => <option key={key} value={key}>{componentLabel(key)}</option>)}</select></label><label>Claim date<input required type="date" name="claimDate" defaultValue={item.created?.slice(0, 10) || currentDate()} /></label><label>Claim mileage<input required type="number" min="0" name="mileage" step="1" /></label></div><button className="ghost-button" type="submit">Link and screen</button>{error && <p role="alert" className="prediction-error">{error}</p>}</form>}
  </details>
}
