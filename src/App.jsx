import { useState } from 'react'
import './App.css'
import Header from './components/Header'
import useTheme from './hooks/useTheme'
import usePage from './hooks/usePage'
import OverviewPage from './pages/OverviewPage'
import WarrantyPage from './pages/WarrantyPage'
import FinancingPage from './pages/FinancingPage'
import RiskPage from './pages/RiskPage'
import ReportsPage from './pages/ReportsPage'
import NotesPage from './pages/NotesPage'
import PortfolioPage from './pages/PortfolioPage'
import NewCaseDialog from './components/NewCaseDialog'
import useCases from './hooks/useCases'
import useAssets from './hooks/useAssets'
import useAssessments from './hooks/useAssessments'
import { screenWarranty, financeSummary, currentDate } from './utils/warranty'
import { exportCsv, downloadServiceRecords, rupees } from './utils/actions'

function App() {
  const { page, navigate } = usePage()
  const { theme, error: themeError, toggleTheme } = useTheme()
  const { cases, storageError, saveCases: save } = useCases()
  const { assets, error: assetError, saveAssets } = useAssets()
  const { assessments, retry } = useAssessments(cases, assets)
  const [filterVehicle, setFilterVehicle] = useState('')
  const [newCase, setNewCase] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState('All')
  const [notice, setNotice] = useState('')
  const filtered = cases.filter((c) => (filter === 'All' || c.status === filter) && (!filterVehicle || c.assetId === filterVehicle))
  const visible = showAll ? filtered : filtered.slice(0, 4)
  const stats = [
    ['Registered vehicles', assets.length],
    ['Claims awaiting decision', cases.filter((c) => ['Pending', 'Review'].includes(c.status)).length],
    ['Original financed principal', rupees(assets.reduce((sum, a) => sum + (financeSummary(a).principal || 0), 0))],
    ['Expired entered policies', assets.filter((a) => a.policy.end < currentDate()).length],
  ]
  async function downloadServices() {
    try { await downloadServiceRecords(); setNotice("Service records downloaded in INR.") }
    catch (error) { setNotice(error.message) }
  }
  function download(rows, filename) { try { exportCsv(rows, filename); setNotice(`Downloaded ${filename}. Amounts use INR.`) } catch (e) { setNotice(e.message) } }
  function status(id, value) { try { save(cases.map((c) => c.id === id ? { ...c, status: value, decisions: [...(c.decisions || []), { status: value, at: new Date().toISOString() }] } : c)); setNotice('Case status saved.') } catch (error) { setNotice(error.message || 'Browser storage is unavailable.') } }
  return <div className="app-shell">
    <Header page={page} theme={theme} onToggleTheme={toggleTheme} onExport={downloadServices} onNewCase={() => setNewCase(true)} />
    <main className="dashboard" id="page-content" tabIndex="-1">
      <div className="page-heading"><p className="eyebrow accent">Plutus workspace</p><h2>{page.charAt(0).toUpperCase() + page.slice(1)}</h2></div>
      {themeError && <p role="status" className="subcopy">{themeError}</p>}
      {assetError && <p role="alert" className="prediction-error">{assetError}</p>}
      {storageError && <p role="alert" className="prediction-error">{storageError}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {page === 'overview' && <OverviewPage cases={cases} stats={stats} navigate={navigate} reviewQueue={() => { setFilterVehicle(''); setFilter('Pending'); setShowAll(true); navigate('warranty') }} />}
      {page === 'warranty' && <WarrantyPage filtered={filtered} visible={visible} showAll={showAll} setShowAll={setShowAll} filter={filter} setFilter={setFilter} status={status} cases={cases} assets={assets} assessments={assessments} retry={retry} filterVehicle={filterVehicle} setFilterVehicle={setFilterVehicle} onLink={(id, fields) => save(cases.map((c) => c.id === id ? { ...c, ...fields } : c))} />}
      {page === 'financing' && <FinancingPage assets={assets} cases={cases} onSave={(next) => { saveAssets(next); setNotice('Shared vehicle and policy record saved.'); }} onOpenCases={(id) => { setFilterVehicle(id); setFilter('All'); setShowAll(true); navigate('warranty'); }} />}
      {page === 'risk' && <RiskPage cases={cases} assets={assets} assessments={assessments} />}
      {page === 'reports' && <ReportsPage assets={assets} assessments={assessments} cases={cases} download={download} downloadServices={downloadServices} />}
      {page === 'notes' && <NotesPage />}
      {page === 'portfolio' && <PortfolioPage />}

    </main>
    {newCase && <NewCaseDialog assets={assets} onRegister={() => navigate('financing')} onClose={() => setNewCase(false)} onSave={(c) => { const check = screenWarranty(c, assets, [...cases, c]); save([...cases, { ...c, status: check.state === 'Needs attention' ? 'Review' : 'Pending' }]); setFilterVehicle(''); setFilter('All'); setNotice('Linked warranty case saved. Policy and model checks run automatically.'); navigate('warranty') }} />}
  </div>
}
export default App
