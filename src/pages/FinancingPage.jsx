import { rupees } from '../utils/actions'
import { FinancePlanner } from '../components/WorkspaceTools'
import VehicleFinanceForm from '../components/VehicleFinanceForm'
import { financeSummary, vehicleLabel, screenWarranty } from '../utils/warranty'

export default function FinancingPage({ assets, cases, onSave, onOpenCases }) {
  return <div className="page-stack"><VehicleFinanceForm assets={assets} onSave={onSave} /><article className="panel panel-large"><div className="panel-header"><div><p className="eyebrow accent">Warranty + financing in parallel</p><h3>Registered vehicle accounts</h3></div></div><div className="table-wrap"><table><thead><tr><th>Vehicle / owner</th><th>Monthly EMI</th><th>Obligations / income</th><th>Overdue balance</th><th>Warranty cases</th><th>Policy checks</th></tr></thead><tbody>{assets.map((asset) => {
    const summary = financeSummary(asset)
    const linked = cases.filter((c) => c.assetId === asset.id)
    const attention = linked.filter((c) => screenWarranty(c, assets, cases).state !== 'Ready for review').length
    return <tr key={asset.id}><td>{vehicleLabel(asset)}<br /><span className="subcopy">{asset.owner}</span></td><td>{rupees(summary.emi)}</td><td>{summary.monthlyObligationRatio === null ? 'Income missing' : `${summary.monthlyObligationRatio.toFixed(1)}%`}</td><td>{rupees(asset.overdueAmount)}</td><td><button className="ghost-button small" onClick={() => onOpenCases(asset.id)}>{linked.length} linked cases</button></td><td>{attention} need attention</td></tr>
  })}</tbody></table></div>{!assets.length && <p className="empty-state">Register your first vehicle above to connect the two workflows.</p>}<p className="subcopy chart-caption">Loan figures use entered terms. Repayment balances are not inferred from claim costs or training credit scores.</p></article><div className="workspace-tools"><FinancePlanner /><aside className="panel side-panel"><div className="panel-header"><h3>Warranty and financing stay connected</h3></div><p className="subcopy">Each registered vehicle stores its owner, actual policy terms, loan terms, and entered obligations. Open linked cases to see the same record in the warranty queue.</p><p className="subcopy">The loan planner calculates EMI from entered terms. Credit approval and warranty approval remain separate staff decisions; the claim model does not make lending decisions.</p></aside></div></div>
}
