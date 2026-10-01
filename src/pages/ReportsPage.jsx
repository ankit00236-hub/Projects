import { ReportsPanel } from '../components/Insights'
import { screenWarranty, financeSummary } from '../utils/warranty'
import { rupees } from '../utils/actions'

export default function ReportsPage({ cases, assets, assessments, download, downloadServices }) {
  const linked = cases.map((item) => {
    const result = screenWarranty(item, assets, cases)
    const finance = result.asset ? financeSummary(result.asset) : null
    const model = assessments[item.id]
    return { case_id: item.id, vehicle_id: result.asset?.registration || '', owner: item.owner, component: item.claim, claim_date: item.claimDate || '', requested_inr: item.amount, staff_decision: item.status, policy_screening: result.state, policy_issues: result.checks.filter((c) => !c.ok).map((c) => c.name).join('; '), monthly_emi_inr: finance?.emi ?? '', overdue_inr: result.asset?.overdueAmount ?? '', model_estimate_inr: model?.data?.predicted_service_cost ?? '', cost_triage: model?.data?.triage || (model?.loading ? 'checking' : 'unavailable') }
  })
  const accounts = assets.map((a) => { const finance = financeSummary(a); return { vehicle_id: a.registration, owner: a.owner, original_principal_inr: finance.principal, monthly_emi_inr: finance.emi, obligation_ratio_percent: finance.monthlyObligationRatio, entered_overdue_inr: a.overdueAmount, policy_start: a.policy.start, policy_end: a.policy.end, per_claim_limit_inr: a.policy.claimLimit, linked_cases: cases.filter((c) => c.assetId === a.id).length } })
  return <div className="page-stack"><article className="panel panel-large"><div className="panel-header"><div><p className="eyebrow accent">Integrated operational reports</p><h3>Warranty and financing cross-reference</h3></div></div><div className="metric-pair"><div><span>Registered vehicles</span><strong>{assets.length}</strong></div><div><span>Total requested claim amount</span><strong>{rupees(cases.reduce((sum, c) => sum + c.amount, 0))}</strong></div></div><div className="hero-actions"><button className="primary-button" disabled={!linked.length} onClick={() => download(linked, 'linked-warranty-financing-INR.csv')}>Export linked claim checks</button><button className="ghost-button" disabled={!accounts.length} onClick={() => download(accounts, 'registered-vehicles-INR.csv')}>Export vehicle financing</button></div><p className="subcopy chart-caption">Includes screening reasons, recorded staff decisions, model check state, and explicitly linked loan facts. Financed principal is the original loan amount.</p></article><ReportsPanel cases={cases} download={download} downloadServices={downloadServices} /></div>
}
