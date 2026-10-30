import { useState } from 'react'
import data from '../data/vehicleOptions.json'
import { screenWarranty, financeSummary, vehicleLabel, componentLabel, currentDate } from '../utils/warranty'
import { rupees } from '../utils/actions'

export default function CaseChecks({ item, assets, cases, model, onLink, onScreen, modelData }) {
  const [error, setError] = useState('')
  const result = screenWarranty(item, assets, cases)
  const finance = result.asset ? financeSummary(result.asset) : null
  async function link(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try { await onLink(item.id, { assetId: form.get('assetId'), claimKey: form.get('component'), claim: componentLabel(form.get('component')), claimDate: form.get('claimDate'), mileage: Number(form.get('mileage')) }); setError('') }
    catch (failure) { setError(failure.message) }
  }
  return <details className="case-checks"><summary>{result.state} · {model?.loading ? 'model checking…' : model?.data ? 'experimental model checked' : 'model not checked'}</summary>
    {item.demo && <p className="subcopy"><strong>Demo scenario:</strong> {item.demoScenario}</p>}
    <ul className="check-list">{result.checks.map((check) => <li key={check.name}><b className={check.ok ? 'check-pass' : 'check-attention'}>{check.ok ? '✓' : '!'} {check.name}</b><span>{check.detail}</span></li>)}</ul>
    {finance && <div className="insight-note"><strong>Linked financing: {result.asset.registration}</strong><p>EMI {rupees(finance.emi)} · outstanding overdue {rupees(result.asset.overdueAmount)}{finance.monthlyObligationRatio !== null && ` · monthly obligations ${finance.monthlyObligationRatio.toFixed(1)}% of entered income`}</p><p>Financing facts are shown in parallel; overdue balances do not determine warranty coverage.</p></div>}
    {model?.data && <div className="insight-note"><strong>Experimental fraud model score: {(model.data.model_score * 100).toFixed(2)}%</strong><p>{model.data.review}. This score is not a calibrated fraud probability.</p><ul>{model.data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><button className="ghost-button small" onClick={() => onScreen({ ...item, claim_date: item.claimDate, repair_cost_inr: item.amount })}>Open model details</button></div>}
    {!item.defect_code || !item.dealer_id ? <p className="subcopy">This case has no supported model defect/dealer mapping. Policy and financing checks still apply; no fraud score is inferred.</p> : null}
    {model?.error && <p role="status" className="prediction-error">{model.error}</p>}
    {result.asset && modelData && <form className="page-stack model-mapping-form" onSubmit={async (event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); try { await onLink(item.id, { defect_code: fields.get('defect_code'), dealer_id: fields.get('dealer_id') }); setError('') } catch (failure) { setError(failure.message) } }}><p className="subcopy">Use a verified defect and dealer mapping for this case. Leaving either blank skips the model.</p><div className="prediction-form"><label>Model defect<select name="defect_code" defaultValue={item.defect_code || ''}><option value="">Not mapped</option>{modelData.defects.map((value) => <option key={value}>{value}</option>)}</select></label><label>Model dealer<select name="dealer_id" defaultValue={item.dealer_id || ''}><option value="">Other / not recorded</option>{modelData.dealers.map((value) => <option key={value}>{value}</option>)}</select></label></div><button className="ghost-button small">Save model mapping</button></form>}
    {error && result.asset && <p role="alert">{error}</p>}
    {!result.asset && assets.length > 0 && <form onSubmit={link} className="page-stack"><p className="subcopy">Complete the link for this previously saved case.</p><div className="prediction-form"><label>Vehicle<select name="assetId">{assets.map((a) => <option key={a.id} value={a.id}>{vehicleLabel(a)}</option>)}</select></label><label>Component<select name="component" defaultValue={item.claimKey || data.flags.find((k) => componentLabel(k).toLowerCase() === item.claim.toLowerCase())}>{data.flags.map((key) => <option key={key} value={key}>{componentLabel(key)}</option>)}</select></label><label>Claim date<input required type="date" name="claimDate" defaultValue={item.created?.slice(0, 10) || currentDate()} /></label><label>Claim mileage<input required type="number" min="0" name="mileage" step="1" /></label></div><button className="ghost-button" type="submit">Link and screen</button>{error && <p role="alert" className="prediction-error">{error}</p>}</form>}
  </details>
}
