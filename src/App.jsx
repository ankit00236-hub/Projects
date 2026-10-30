import { useEffect, useState } from 'react'
import './App.css'
import './claims.css'
import Header from './components/Header'
import AccountGate from './components/AccountGate'
import useTheme from './hooks/useTheme'
import usePage from './hooks/usePage'
import useCases from './hooks/useCases'
import useAssets from './hooks/useAssets'
import useRecords from './hooks/useRecords'
import useAssessments from './hooks/useAssessments'
import OverviewPage from './pages/OverviewPage'
import WarrantyPage from './pages/WarrantyPage'
import FinancingPage from './pages/FinancingPage'
import RiskPage from './pages/RiskPage'
import ReportsPage from './pages/ReportsPage'
import NotesPage from './pages/NotesPage'
import PortfolioPage from './pages/PortfolioPage'
import NewCaseDialog from './components/NewCaseDialog'
import { Screening, ClaimHistory, Evaluation } from './components/ClaimModelTools'
import { api } from './utils/api'
import { exportCsv, rupees, readCases } from './utils/actions'
import { validateVehicles } from './utils/vehicleRecords'
import { screenWarranty, financeSummary, currentDate } from './utils/warranty'

const titles = { overview: 'Overview', warranty: 'Warranty management', financing: 'Vehicle & financing', risk: 'Integrated review', reports: 'Reports', notes: 'Desk notes', portfolio: 'Vehicle portfolio', screening: 'Claim screening', claims: 'Training claim history', evaluation: 'Model evaluation' }
const modelTabs = { screening: 'Claim screening', claims: 'Training history', evaluation: 'Model evaluation' }

export function App({ initialData = null }) {
  const { page, navigate } = usePage()
  const { theme, toggleTheme, error: themeError } = useTheme()
  const { cases, storageError, saveCases, reload: reloadCases, loaded: casesLoaded } = useCases()
  const { assets, error: assetError, saveAssets, reload: reloadAssets, loaded: assetsLoaded } = useAssets()
  const notes = useRecords('notes')
  const { assessments, retry } = useAssessments(cases, assets)
  const [data, setData] = useState(initialData), [dataError, setDataError] = useState(''), [reload, setReload] = useState(0)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [newCase, setNewCase] = useState(false), [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('All'), [filterVehicle, setFilterVehicle] = useState(''), [showAll, setShowAll] = useState(false)
  const [selection, setSelection] = useState(null)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    api('/claims-data', { signal: controller.signal }).then((next) => { if (active) setData(next) }).catch((error) => { if (active) setDataError(controller.signal.aborted ? 'Model data loading timed out. Retry below.' : error.message) }).finally(() => clearTimeout(timer))
    return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [reload])
  function download(rows, filename) { try { exportCsv(rows, filename); setNotice(`Downloaded ${filename}. Amounts use INR.`) } catch (error) { setNotice(error.message) } }
  async function status(id, value) {
    try { await saveCases(cases.map((item) => item.id === id ? { ...item, status: value, decisions: [...(item.decisions || []), { status: value, at: new Date().toISOString() }] } : item)); setNotice('Staff decision saved.') }
    catch (error) { setNotice(error.message) }
  }
  function openCases(id = '') { setFilterVehicle(id); setFilter('All'); setShowAll(true); navigate('warranty') }
  function openScreening(record) { setSelection((previous) => ({ record, revision: (previous?.revision ?? 0) + 1 })); navigate('screening') }
  async function importBrowserRecords() {
    try {
      const oldAssets = JSON.parse(localStorage.getItem('plutus-assets-v1') || '[]'), oldCases = readCases(), oldNotes = JSON.parse(localStorage.getItem('plutus-notes') || '[]')
      validateVehicles(oldAssets)
      if (!Array.isArray(oldNotes)) throw new Error('Browser notes are damaged; import stopped.')
      if (!assets.length && oldAssets.length) await saveAssets(oldAssets)
      if (!cases.length && oldCases.length) await saveCases(oldCases)
      if (!notes.records.length && oldNotes.length) await notes.save(oldNotes)
      setNotice('Browser records imported into empty collections; existing records were preserved.')
    } catch (error) { setNotice(error.message) }
  }
  async function loadDemoData() {
    setLoadingDemo(true)
    try {
      const result = await api('/demo-data', { method: 'POST' })
      await Promise.all([reloadAssets(), reloadCases(), notes.reload()])
      setNotice(`Demo data ready: added ${result.added.assets} vehicles, ${result.added.cases} warranty cases, and ${result.added.notes} follow-ups. Existing records preserved.`)
    } catch (error) { setNotice(error.message) }
    finally { setLoadingDemo(false) }
  }
  const demoCount = assets.filter((item) => item.demo).length + cases.filter((item) => item.demo).length + notes.records.filter((item) => item.demo).length
  const filtered = cases.filter((item) => (filter === 'All' || item.status === filter) && (!filterVehicle || item.assetId === filterVehicle))
  const stats = [['Registered vehicles', assets.length], ['Claims awaiting decision', cases.filter((item) => ['Pending', 'Review'].includes(item.status)).length], ['Original financed principal', rupees(assets.reduce((sum, asset) => sum + (financeSummary(asset).principal || 0), 0))], ['Expired entered policies', assets.filter((asset) => asset.policy.end < currentDate()).length]]
  return <div className="app-shell claims-workspace integrated-workspace">
    <Header page={page} theme={theme} onToggleTheme={toggleTheme} onExport={() => navigate('reports')} onNewCase={() => setNewCase(true)} />
    <main className="dashboard" id="page-content" tabIndex="-1">
      <div className="claims-intro"><div><p className="eyebrow accent">Integrated Automotive Warranty and Financing Management System</p><h2>{titles[page]}</h2><p className="subcopy">Shared vehicles and policies connect warranty claims, financing, follow-ups, and model-assisted review.</p></div></div>
      {[themeError, assetError, storageError].filter(Boolean).map((error) => <p role="alert" key={error} className="prediction-error">{error}</p>)}
      {notice && <p role="status" className="notice">{notice}</p>}
      {demoCount > 0 && <p className="demo-banner" role="status">Demo examples included · {assets.filter((item) => item.demo).length} vehicles, {cases.filter((item) => item.demo).length} claims, {notes.records.filter((item) => item.demo).length} follow-ups. Names prefixed “Demo” and registrations starting DEMO are synthetic test records, separate from model training.</p>}
      <div id="overview-tab" hidden={page !== 'overview'}><OverviewPage cases={cases} assets={assets} stats={stats} navigate={navigate} reviewQueue={() => openCases()} /><div className="hero-actions"><button className="primary-button" data-action="load-demo" onClick={loadDemoData} disabled={loadingDemo || !assetsLoaded || !casesLoaded || !notes.loaded}>{loadingDemo ? 'Adding demo data…' : demoCount ? 'Complete demo examples' : 'Add demo examples'}</button><button className="ghost-button small" onClick={importBrowserRecords}>Import records from this browser</button></div><p className="subcopy">Demo examples cover different claim statuses, policy exceptions, financing situations, and follow-up categories. Adding them again preserves existing records and avoids duplicates.</p></div>
      <div id="warranty-tab" hidden={page !== 'warranty'}><WarrantyPage modelData={data} filtered={filtered} visible={showAll ? filtered : filtered.slice(0, 4)} showAll={showAll} setShowAll={setShowAll} filter={filter} setFilter={setFilter} status={status} cases={cases} assets={assets} assessments={assessments} retry={retry} filterVehicle={filterVehicle} setFilterVehicle={setFilterVehicle} onLink={(id, fields) => saveCases(cases.map((item) => item.id === id ? { ...item, ...fields } : item))} onScreen={openScreening} onNewCase={() => setNewCase(true)} /></div>
      <div id="financing-tab" hidden={page !== 'financing'}><FinancingPage assets={assets} cases={cases} onSave={async (next) => { await saveAssets(next); setNotice('Shared vehicle, financing and policy record saved.'); }} onOpenCases={openCases} /></div>
      <div id="risk-tab" hidden={page !== 'risk'}><RiskPage cases={cases} assets={assets} assessments={assessments} data={data} /></div>
      <div id="reports-tab" hidden={page !== 'reports'}><ReportsPage assets={assets} assessments={assessments} cases={cases} download={download} data={data} /></div>
      <div id="notes-tab" hidden={page !== 'notes'}><NotesPage state={notes} /></div>
      <div id="portfolio-tab" hidden={page !== 'portfolio'}><PortfolioPage assets={assets} cases={cases} onOpenCases={openCases} onRegister={() => navigate('financing')} /></div>
      <div hidden={!Object.hasOwn(modelTabs, page)}>
        <nav className="model-tools-nav" aria-label="Model tools">{Object.entries(modelTabs).map(([id, text]) => <a href={`#/${id}`} aria-current={page === id ? 'page' : undefined} key={id}>{text}</a>)}</nav>
        <p className="claims-callout">The model supports claim review alongside entered policy checks and linked financing. It does not approve claims or financing. <button className="claims-text-button" onClick={() => navigate('warranty')}>Return to warranty queue →</button> · <button className="claims-text-button" data-action="view-evaluation" onClick={() => navigate('evaluation')}>View evaluation →</button></p>
        {dataError && <div role="alert" className="claims-callout"><p>{dataError}</p><button className="ghost-button" onClick={() => { setDataError(''); setReload((value) => value + 1) }}>Retry loading</button></div>}
        {!data && !dataError && <p role="status">Loading the claim model and training data…</p>}
        {data && <><div id="screening-tab" hidden={page !== 'screening'}><Screening key={selection?.revision ?? 0} data={data} record={selection?.record} /></div><div id="claims-tab" hidden={page !== 'claims'}><ClaimHistory data={data} onScreen={openScreening} /></div><div id="evaluation-tab" hidden={page !== 'evaluation'}><Evaluation data={data} /></div></>}
      </div>
    </main>
    {newCase && <NewCaseDialog assets={assets} modelData={data} onRegister={() => navigate('financing')} onClose={() => setNewCase(false)} onSave={async (item) => { const check = screenWarranty(item, assets, [...cases, item]); await saveCases([...cases, { ...item, status: check.state === 'Needs attention' ? 'Review' : 'Pending' }]); openCases(); setNotice('Linked warranty case saved. Policy and model checks run alongside the vehicle financing record.'); }} />}
  </div>
}
export default function ConnectedApp() { return <AccountGate><App /></AccountGate> }
