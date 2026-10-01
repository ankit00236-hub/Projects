import { useEffect, useRef, useState } from 'react'
import data from '../data/trainingData.json'
import { rupees, title } from '../utils/actions'

export default function ServiceEstimator() {
  const initial = data.initialForm
  const activeRequest = useRef(null)
  useEffect(() => () => activeRequest.current?.abort(), [])
  const [form, setForm] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cost, setCost] = useState(null)
  const fields = ['brand', 'model', 'engine_type', 'make_year', 'region']
  function updateVehicle(field, value) {
    const index = fields.indexOf(field)
    const match = data.vehicles.find((v) => String(v[field]) === value && fields.slice(0, index).every((key) => v[key] === form[key]))
    if (match) setForm({ ...form, ...match })
    setCost(null)
  }
  async function predict(event) {
    event.preventDefault()
    if (activeRequest.current) return
    const controller = new AbortController()
    activeRequest.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setLoading(true)
    setError('')
    setCost(null)
    try {
      const response = await fetch('/api/predict-service-cost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form), signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'The backend rejected these vehicle details.')
      if (!Number.isFinite(result.predicted_service_cost) || result.predicted_service_cost < 0) throw new Error('The backend returned an invalid estimate.')
      setCost(result.predicted_service_cost)
    } catch (failure) {
      setError(failure.name === 'AbortError' ? 'The request timed out. Please try again.' : failure instanceof TypeError || failure instanceof SyntaxError ? 'Start the Plutus backend on port 8000 to predict service costs.' : failure.message)
    } finally { clearTimeout(timeout); activeRequest.current = null; setLoading(false) }
  }
  return <section className="service-predictor" id="estimator">
    <div><p className="eyebrow">Trained maintenance model</p><h3>Service cost prediction</h3><p className="subcopy">Vehicle combinations and service intervals come from the training records. Costs are in INR.</p></div>
    <form onSubmit={predict}>
      <fieldset disabled={loading} className="prediction-form form-fields">
        {fields.map((field, index) => {
          const options = [...new Set(data.vehicles.filter((v) => fields.slice(0, index).every((key) => v[key] === form[key])).map((v) => v[field]))]
          return <label key={field}>{title(field)}<select value={form[field]} onChange={(e) => updateVehicle(field, e.target.value)}>{options.map((v) => <option key={v} value={v}>{title(String(v))}</option>)}</select></label>
        })}
        <label>Service interval (km)<select value={form.mileage_range} onChange={(e) => { setForm({ ...form, mileage_range: Number(e.target.value) }); setCost(null) }}>{data.mileageRanges.map((v) => <option key={v} value={v}>{v.toLocaleString('en-IN')}</option>)}</select></label>
        <label>Mileage (km)<input required type="number" min="0" step="1" value={form.mileage} onChange={(e) => { setForm({ ...form, mileage: Number(e.target.value) }); setCost(null) }} /></label>
      </fieldset>
      <fieldset disabled={loading} className="component-options"><legend>Service components</legend>{data.flags.map((flag) => <label key={flag}><input type="checkbox" checked={Boolean(form[flag])} onChange={(e) => { setForm({ ...form, [flag]: Number(e.target.checked) }); setCost(null) }} />{title(flag === 'whell_alignment_and_balancing' ? 'wheel_alignment_and_balancing' : flag)}</label>)}</fieldset>
      <button className="primary-button" disabled={loading} type="submit">{loading ? 'Estimating…' : 'Predict Service Cost'}</button>
    </form>
    {error && <p className="prediction-error" role="alert">{error}</p>}
    {cost !== null && <div className="prediction-result" role="status"><span>Estimated service cost</span><strong>{rupees(cost)}</strong></div>}
  </section>
}
