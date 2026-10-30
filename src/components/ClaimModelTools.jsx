import { useEffect, useRef, useState } from 'react'
import { api } from '../utils/api'
import { exportCsv, rupees } from '../utils/actions'
const label = (value) => value.replaceAll('_', ' ')
const pct = (value) => `${(value * 100).toFixed(2)}%`

export function Screening({ data, record }) {
  const [form, setForm] = useState({ claim_date: record?.claim_date ?? data.summary.end, defect_code: record?.defect_code ?? data.defects[0], dealer_id: record?.dealer_id ?? data.dealers[0], repair_cost_inr: record?.repair_cost_inr ?? data.summary.median_cost_inr })
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  function update(key, value) { setForm((old) => ({ ...old, [key]: value })); setResult(null); setError('') }
  async function submit(event) {
    event.preventDefault()
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setBusy(true); setError(''); setResult(null)
    try { setResult(await api('/screen-claim', { method: 'POST', body: JSON.stringify(form), signal: controller.signal })) }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); else setError('Screening timed out. Please try again.') }
    finally { clearTimeout(timeout); request.current = null; setBusy(false) }
  }
  return <div className="claims-screen-grid">
    <section className="claims-panel">
      <p className="eyebrow accent">Supporting feature · machine learning</p><h3>Screen a warranty claim</h3>
      <p className="subcopy">Enter the claim details to run the trained fraud model and compare the repair amount with historical claims.</p>
      <form onSubmit={submit}>
        {record && <p className="claims-footnote">Loaded {record.claim_id ? "historical" : "workspace"} claim <strong>{record.claim_id || record.id}</strong>. {record.claim_id ? "This record was used to fit the final model; its score is not an independent validation result." : "The saved claim, policy and financing remain linked in the warranty queue."}</p>}
        <fieldset className="claims-fields" disabled={busy}>
          <label>Defect<select value={form.defect_code} onChange={(e) => update('defect_code', e.target.value)}>{data.defects.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Dealer<select value={form.dealer_id} onChange={(e) => update('dealer_id', e.target.value)}>{data.dealers.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Claim date<input type="date" required value={form.claim_date} onChange={(e) => update('claim_date', e.target.value)} /></label>
          <label>Repair cost (INR)<input type="number" required min="0.01" max="1000000000" step="0.01" value={form.repair_cost_inr} onChange={(e) => update('repair_cost_inr', e.target.value === '' ? '' : Number(e.target.value))} /></label>
        </fieldset>
        <button className="primary-button" disabled={busy}>{busy ? 'Running model…' : 'Run claim screening →'}</button>
      </form>
      <p className="claims-footnote">This runs an experimental model. It does not save a new claim or change any historical decision.</p>
      {error && <p role="alert" className="prediction-error">{error}</p>}
    </section>
    <section className="claims-panel claims-result" aria-live="polite" aria-busy={busy}>
      {result ? <>
        <p className="eyebrow">Experimental model output</p><h3>{result.review}</h3>
        <div className="claims-score"><strong>{pct(result.model_score)}</strong><span>Model score · not a calibrated probability</span></div>
        <p className="subcopy">Dataset flagged rate: {pct(result.baseline_rate)}. Model: {label(result.model)}.</p>
        <ul className="claims-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        <div className="claims-comparison"><h4>Historical cost context</h4><p>{result.comparison.records} claims with this defect · median {rupees(result.comparison.median_cost_inr)}</p><p>Your amount is at the {result.comparison.cost_percentile}th percentile.</p><p className="claims-footnote">{result.comparison.scope}</p></div>
      </> : <><span className="claims-result-symbol" aria-hidden="true">↗</span><p className="eyebrow">From claim to context</p><h3>Your screening appears here.</h3><p className="subcopy">Run the model to see its score, data limitations, and a repair cost comparison.</p><p className="claims-footnote">Approval and fraud labels are excluded from model inputs. Every claim still needs a human decision.</p></>}
    </section>
  </div>
}

export function ClaimHistory({ data, onScreen }) {
  const [query, setQuery] = useState(''), [flag, setFlag] = useState('all'), [page, setPage] = useState(0), [notice, setNotice] = useState('')
  const filtered = data.records.filter((row) => (flag === 'all' || String(row.fraud_flag) === flag) && Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 20))
  function download() { try { exportCsv(filtered, 'plutus-warranty-claims.csv'); setNotice(`Exported ${filtered.length} claims.`) } catch (error) { setNotice(error.message) } }
  return <section className="claims-panel">
    <div className="claims-section-heading"><div><p className="eyebrow">Uploaded dataset</p><h3>Historical warranty claims</h3></div><button className="ghost-button" onClick={download}>Export filtered claims</button></div>
    <p className="subcopy">Original labels from your CSV. Historical approval and fraud flags are separate outcomes; these are not model predictions.</p>
    <div className="claims-filters"><label>Search claims<input type="search" value={query} placeholder="Claim, masked VIN, defect, dealer…" onChange={(e) => { setQuery(e.target.value); setPage(0) }} /></label><label>Recorded fraud flag<select value={flag} onChange={(e) => { setFlag(e.target.value); setPage(0) }}><option value="all">All claims</option><option value="1">Flagged</option><option value="0">Not flagged</option></select></label></div>
    {notice && <p role="status">{notice}</p>}
    <div className="claims-table-wrap"><table className="claims-table"><caption>{filtered.length} matching claims · amounts in INR</caption><thead><tr>{['Claim', 'Masked VIN', 'Date', 'Defect', 'Dealer', 'Repair cost', 'Approved', 'Fraud flag', 'Action'].map((item) => <th scope="col" key={item}>{item}</th>)}</tr></thead><tbody>{filtered.slice(page * 20, (page + 1) * 20).map((row) => <tr key={row.claim_id}><th scope="row">{row.claim_id}</th><td>{row.vin_masked}</td><td>{row.claim_date}</td><td>{label(row.defect_code)}</td><td>{row.dealer_id}</td><td>{rupees(row.repair_cost_inr)}</td><td>{row.approved === 'Y' ? 'Yes' : 'No'}</td><td><span className={row.fraud_flag ? 'claims-badge flagged' : 'claims-badge'}>{row.fraud_flag ? 'Flagged' : 'Not flagged'}</span></td><td><button className="ghost-button small" onClick={() => onScreen(row)} aria-label={`Screen claim ${row.claim_id}`}>Screen claim →</button></td></tr>)}</tbody></table>{!filtered.length && <p role="status">No matching claims. Try another search or filter.</p>}</div>
    <div className="claims-pagination"><button className="ghost-button" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="ghost-button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
  </section>
}

export function Evaluation({ data }) {
  const report = data.evaluation
  const matrix = report.holdout.confusion_matrix
  return <section className="claims-panel">
    <p className="eyebrow accent">Evidence behind the model</p><h3>Model evaluation</h3><p className="subcopy">{report.method}</p>
    <div className="claims-callout"><strong>{report.beats_baseline ? 'Exploratory results only' : 'Baseline check failed'}</strong><p>{report.beats_baseline ? 'The model improved average precision and Brier score on this holdout, but needs independent validation.' : 'The selected model did not improve both average precision and Brier score over the constant-rate baseline. It is not validated for claim decisions.'}</p></div>
    <p>Selected: <strong>{label(report.selected_model)}</strong> · Training: {report.training_rows} claims ({report.training_flagged} flagged) · Holdout: {report.holdout_rows} claims ({report.holdout_flagged} flagged)</p>
    <div className="claims-table-wrap"><table className="claims-table"><caption>Separate holdout · precision and recall use a 0.5 threshold</caption><thead><tr><th scope="col">Metric</th><th scope="col">Selected model</th><th scope="col">Constant baseline</th></tr></thead><tbody>{[['average_precision', 'Average precision (higher is better)'], ['roc_auc', 'ROC AUC (higher is better)'], ['brier_score', 'Brier score (lower is better)'], ['precision_at_0_5', 'Precision at 0.5'], ['recall_at_0_5', 'Recall at 0.5']].map(([key, title]) => <tr key={key}><th scope="row">{title}</th><td>{report.holdout[key].toFixed(4)}</td><td>{report.baseline_holdout[key].toFixed(4)}</td></tr>)}</tbody></table></div>
    <p className="claims-footnote">Holdout counts at 0.5: {matrix[0][0]} true negatives, {matrix[0][1]} false positives, {matrix[1][0]} missed flagged claims, {matrix[1][1]} detected flagged claims.</p>
    <div className="claims-screen-grid"><div><h4>Inputs and leakage prevention</h4><p>{report.features.map(label).join(', ')}.</p><ul>{Object.entries(report.excluded_features).map(([key, reason]) => <li key={key}><strong>{key}:</strong> {reason}</li>)}</ul></div><div><h4>Limits and intended use</h4><ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
    <details><summary>Training comparison and source fingerprint</summary><p>Models were selected using training folds only.</p><ul>{Object.entries(report.candidates).map(([name, value]) => <li key={name}>{label(name)}: mean CV average precision {value.cv_average_precision.toFixed(4)}</li>)}</ul><p className="claims-hash">CSV SHA-256: {report.sha256}</p></details>
  </section>
}

