import { useEffect, useRef, useState } from 'react'
import data from '../data/trainingData.json'
import { componentLabel, currentDate, vehicleLabel } from '../utils/warranty'

export default function NewCaseDialog({ assets, onClose, onSave, onRegister }) {
  const dialog = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    if (!element.open) element.showModal()
    return () => element.close()
  }, [])
  function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const asset = assets.find((a) => a.id === form.get('assetId'))
    const amount = Number(form.get('amount'))
    const mileage = Number(form.get('mileage'))
    if (!asset || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(mileage) || mileage < 0) { setError('Select a registered vehicle and valid claim details.'); return }
    try {
      onSave({ id: crypto.randomUUID(), assetId: asset.id, vehicle: componentLabel(`${asset.service.brand} ${asset.service.model}`), owner: asset.owner, claimKey: form.get('component'), claim: componentLabel(form.get('component')), claimDate: form.get('claimDate'), mileage, amount, status: 'Pending', created: new Date().toISOString() })
      onClose()
    } catch (failure) { setError(failure.message || 'Unable to save the case.') }
  }
  return <dialog aria-labelledby="case-title" ref={dialog} onCancel={onClose} className="case-dialog">
    {!assets.length ? <div className="page-stack"><h2 id="case-title">Register a vehicle first</h2><p className="subcopy">Automatic screening needs a shared vehicle record with financing and policy terms.</p><button className="primary-button" onClick={() => { onClose(); onRegister() }}>Open financing registration</button><button className="ghost-button" onClick={onClose}>Cancel</button></div> : <form onSubmit={submit}><h2 id="case-title">New linked warranty case</h2><p className="subcopy">Policy checks and model-based cost checks run automatically after saving. Staff record the final decision.</p><div className="prediction-form">
      <label>Registered vehicle<select name="assetId">{assets.map((a) => <option key={a.id} value={a.id}>{vehicleLabel(a)} · {a.owner}</option>)}</select></label>
      <label>Claim component<select name="component">{data.flags.map((key) => <option key={key} value={key}>{componentLabel(key)}</option>)}</select></label>
      <label>Claim date<input required type="date" name="claimDate" defaultValue={currentDate()} /></label>
      <label>Mileage at claim (km)<input required type="number" name="mileage" min="0" step="1" /></label>
      <label>Requested amount (₹)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
    </div>{error && <p role="alert" className="prediction-error">{error}</p>}<div className="hero-actions"><button className="primary-button" type="submit">Save & screen claim</button><button className="ghost-button" type="button" onClick={onClose}>Cancel</button></div></form>}
  </dialog>
}
