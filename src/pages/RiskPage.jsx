import { rupees } from '../utils/actions'
import { financeSummary, screenWarranty, vehicleLabel } from '../utils/warranty'
import { BarChart } from '../components/RiskCharts'
import '../components/RiskCharts.css'

const count = (value) => value.toLocaleString('en-IN')
const safeAmount = (value) => Number.isFinite(value) ? value : 0

export default function RiskPage({ cases = [], assets = [], assessments = {}, data }) {
  const screened = cases.map((item) => ({ item, screening: screenWarranty(item, assets, cases) }))
  const accounts = assets.map((asset) => ({ asset, finance: financeSummary(asset), linked: screened.filter(({ item }) => item.assetId === asset.id) }))
  const waiting = cases.filter((item) => ['Pending', 'Review'].includes(item.status))
  const policyStates = ['Ready for review', 'Needs attention', 'Incomplete'].map((label) => ({ label, records: screened.filter(({ screening }) => screening.state === label).length }))
  const modelChecks = cases.map((item) => assessments[item.id]).filter(Boolean)
  const modelErrors = modelChecks.filter((result) => result.error).length
  const modelLoading = modelChecks.filter((result) => result.loading).length
  const modelReview = modelChecks.filter((result) => result.data?.experimental).length
  const unlinked = screened.filter(({ screening }) => !screening.asset).length
  const metrics = [
    ['Original financed principal', rupees(accounts.reduce((total, { finance }) => total + safeAmount(finance.principal), 0)), `${count(assets.length)} entered vehicle accounts; before repayments`],
    ['Entered overdue balance', rupees(assets.reduce((total, asset) => total + safeAmount(asset.overdueAmount), 0)), 'Reported overdue amounts across registered accounts'],
    ['Claims awaiting decision', rupees(waiting.reduce((total, item) => total + safeAmount(item.amount), 0)), `${count(waiting.length)} pending or under review`],
    ['Unlinked warranty cases', count(unlinked), 'Vehicle and policy details needed for screening'],
    ['Model check status', `${count(modelErrors)} errors · ${count(modelLoading)} running`, `${count(modelChecks.filter((result) => result.data).length)} checked; ${count(cases.length - modelChecks.length)} lack model inputs`],
    ['Experimental model checks', count(modelReview), 'Fraud scores add context; every claim requires manual review'],
  ]

  return <div className="page-stack risk-workspace">
    <section className="panel panel-large" aria-labelledby="live-risk-heading">
      <div className="panel-header"><div><p className="eyebrow accent">Current workspace</p><h3 id="live-risk-heading">Warranty and financing review</h3></div></div>
      <p className="subcopy">Automatic policy checks and experimental fraud screening run for linked cases with model inputs. Financing is reviewed alongside the claim; it does not determine warranty coverage.</p>
      <div className="risk-summary-grid">{metrics.map(([label, value, detail]) => <div className="insight-tile" key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></div>)}</div>
      <BarChart title="Automatic policy screening" description="Live checks against the policy terms entered for each case. These states are separate from the final case decision." rows={policyStates} empty={cases.length === 0} emptyMessage="Create a warranty case to see automatic screening results." />
      <p className="subcopy chart-caption">Checks are rerun from current policy and case details. Ready for review means the entered checks pass; approval still requires an authorised decision.</p>
    </section>

    <section className="panel panel-large" aria-labelledby="account-risk-heading">
      <div className="panel-header"><div><p className="eyebrow accent">Shared vehicle accounts</p><h3 id="account-risk-heading">Review the link between claims and financing</h3></div></div>
      {accounts.length > 0 ? <div className="table-wrap"><table><caption className="risk-table-caption">Figures use entered loan terms and balances. Original principal is not an outstanding loan balance.</caption><thead><tr><th scope="col">Vehicle / owner</th><th scope="col">Original principal</th><th scope="col">Monthly EMI</th><th scope="col">Obligations / income</th><th scope="col">Entered overdue</th><th scope="col">Linked cases</th></tr></thead><tbody>{accounts.map(({ asset, finance, linked }) => <tr key={asset.id}><th scope="row">{vehicleLabel(asset)}<span className="risk-account-owner">{asset.owner}</span></th><td>{Number.isFinite(finance.principal) ? rupees(finance.principal) : 'Check loan terms'}</td><td>{Number.isFinite(finance.emi) ? rupees(finance.emi) : 'Unavailable'}</td><td>{Number.isFinite(finance.monthlyObligationRatio) ? `${finance.monthlyObligationRatio.toFixed(1)}%` : 'Income unavailable'}</td><td>{rupees(safeAmount(asset.overdueAmount))}</td><td>{count(linked.length)} total<span className="risk-account-owner">{count(linked.filter(({ screening }) => screening.state !== 'Ready for review').length)} need policy attention</span></td></tr>)}</tbody></table></div> : <p className="empty-state">Register a vehicle on the Financing page, then link its warranty cases to see the shared account review.</p>}
      <p className="subcopy chart-caption">Monthly obligations combine the estimated vehicle EMI and entered existing EMIs. These are affordability facts, not a predicted default score or warranty eligibility rule.</p>
    </section>

    {data && <section className="panel panel-large"><div className="panel-header"><div><p className="eyebrow accent">Separate model training reference</p><h3>Historical claims by defect</h3></div></div><p className="subcopy">{data.summary.records} training claims, including {data.summary.flagged} recorded fraud flags. These records are separate from your account’s operational claims and loans.</p><BarChart title="Training claim distribution" description="Counts by defect in the supplied claims CSV; these are not customer risk scores." rows={data.defects.map((defect) => ({ label: defect.replaceAll('_', ' '), records: data.records.filter((row) => row.defect_code === defect).length }))} /></section>}
  </div>
}
