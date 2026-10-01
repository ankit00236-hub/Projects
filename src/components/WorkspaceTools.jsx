import { useState } from 'react'
import { rupees } from '../utils/actions'
import { loanEstimate } from '../utils/finance'

export function FinancePlanner() {
  const [form, setForm] = useState({ price: 800000, down: 160000, rate: 9, months: 60 })
  const result = loanEstimate(form)
  return <article className="panel panel-large" id="loan-planner"><div className="panel-header"><div><p className="eyebrow accent">Financing workspace</p><h3>Vehicle loan planner</h3></div></div><div className="prediction-form">{[['price', 'Vehicle price (₹)', 1], ['down', 'Down payment (₹)', 0], ['rate', 'Annual interest (%)', 0], ['months', 'Tenure (months)', 1]].map(([key, label, min]) => <label key={key}>{label}<input type="number" min={min} step={key === 'months' ? 1 : '0.01'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value === '' ? '' : Number(e.target.value) })} /></label>)}</div>{result ? <><div className="metric-pair"><div><span>Estimated monthly EMI</span><strong>{rupees(result.emi)}</strong></div><div><span>Loan principal</span><strong>{rupees(result.principal)}</strong></div></div><div className="status-summary"><span>Total interest <b>{rupees(result.interest)}</b></span><span>Total repayments <b>{rupees(result.total)}</b></span></div></> : <p className="prediction-error" role="status">Enter valid amounts, a down payment below the vehicle price, and a tenure of 1–360 months.</p>}<p className="subcopy chart-caption">Illustrative fixed-rate EMI calculation. Fees and insurance are excluded; lender approval is separate.</p></article>
}

function loadNotes() {
  try {
    const snapshot = localStorage.getItem('plutus-notes')
    const notes = JSON.parse(snapshot || '[]')
    if (!Array.isArray(notes) || !notes.every((n) => n && typeof n.id === 'string' && typeof n.text === 'string' && typeof n.done === 'boolean')) throw new Error()
    return { notes, error: '', snapshot }
  } catch { return { notes: [], error: 'Notes storage is unavailable or damaged. Existing notes have been preserved.' } }
}
export function FollowUpNotes() {
  const [state, setState] = useState(loadNotes)
  const [text, setText] = useState('')
  const [category, setCategory] = useState('Warranty')
  const [due, setDue] = useState('')
  const [notice, setNotice] = useState('')
  function save(notes) {
    if (state.error) return
    try {
      if (localStorage.getItem('plutus-notes') !== state.snapshot) {
        setState(loadNotes()); setNotice('Notes changed in another tab. Review them and try again.'); return false
      }
      const snapshot = JSON.stringify(notes)
      localStorage.setItem('plutus-notes', snapshot)
      setState({ notes, error: '', snapshot }); setNotice('Notes saved.'); return true
    }
    catch { setNotice('Could not save notes. Please check browser storage.'); return false }
  }
  function add(event) {
    event.preventDefault()
    if (!text.trim()) return
    if (save([...state.notes, { id: crypto.randomUUID(), text: text.trim(), category, due, done: false }])) { setText(''); setDue('') }
  }
  return <article className="panel panel-large" id="notes"><div className="panel-header"><div><p className="eyebrow accent">Follow-up board</p><h3>Desk notes</h3></div><span className="note-count">{state.notes.filter((n) => !n.done).length} open</span></div><p className="subcopy">Keep claim documents, dealer callbacks, and financing follow-ups together. Saved in this browser.</p><form onSubmit={add} className="note-form"><label>Follow-up<textarea maxLength={500} required value={text} onChange={(e) => setText(e.target.value)} placeholder="Request service invoice for a warranty claim…" /></label><div className="prediction-form"><label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>{['Warranty', 'Financing', 'Dealer', 'General'].map((v) => <option key={v}>{v}</option>)}</select></label><label>Due date<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label></div><button className="primary-button" disabled={Boolean(state.error)}>Add note</button></form>{(state.error || notice) && <p role="status" className="subcopy">{state.error || notice}</p>}<div className="notes-grid">{state.notes.map((n) => <div className={`desk-note ${n.done ? 'completed' : ''}`} key={n.id}><div className="note-meta"><span>{n.category}</span>{n.due && <time dateTime={n.due}>{n.due}</time>}</div><p>{n.text}</p><div className="note-controls"><label><input type="checkbox" checked={n.done} onChange={() => save(state.notes.map((item) => item.id === n.id ? { ...item, done: !item.done } : item))} />Done</label><button type="button" className="ghost-button small" onClick={() => save(state.notes.filter((item) => item.id !== n.id))} aria-label={`Delete note: ${n.text}`}>Delete</button></div></div>)}</div>{!state.notes.length && <p className="empty-state">Add your first follow-up above.</p>}</article>
}
