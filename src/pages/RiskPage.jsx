import data from '../data/trainingData.json'
import { rupees } from '../utils/actions'
import { financeSummary, screenWarranty, vehicleLabel } from '../utils/warranty'
import { BarChart, ServiceCostChart } from '../components/RiskCharts'
import '../components/RiskCharts.css'

const count = (value) => value.toLocaleString('en-IN')
const safeAmount = (value) => Number.isFinite(value) ? value : 0

export default function RiskPage({ cases = [], assets = [], assessments = {} }) {
  const screened = cases.map((item) => ({ item, screening: screenWarranty(item, assets, cases) }))
  const accounts = assets.map((asset) => ({ asset, finance: financeSummary(asset), linked: screened.filter(({ item }) => item.assetId === asset.id) }))
  const waiting = cases.filter((item) => ['Pending', 'Review'].includes(item.status))
  const policyStates = ['Ready for review', 'Needs attention', 'Incomplete'].map((label) => ({ label, records: screened.filter(({ screening }) => screening.state === label).length }))
  const modelChecks = cases.map((item) => assessments[item.id]).filter(Boolean)
  const modelErrors = modelChecks.filter((result) => result.error).length
  const modelLoading = modelChecks.filter((result) => result.loading).length
  const modelReview = modelChecks.filter((result) => result.data?.triage === 'review').length
  const unlinked = screened.filter(({ screening }) => !screening.asset).length
  const credit = data.insights.credit
  const metrics = [
    ['Original financed principal', rupees(accounts.reduce((total, { finance }) => total + safeAmount(finance.principal), 0)), `${count(assets.length)} entered vehicle accounts; before repayments`],
    ['Entered overdue balance', rupees(assets.reduce((total, asset) => total + safeAmount(asset.overdueAmount), 0)), 'Reported overdue amounts across registered accounts'],
    ['Claims awaiting decision', rupees(waiting.reduce((total, item) => total + safeAmount(item.amount), 0)), `${count(waiting.length)} pending or under review`],
    ['Unlinked warranty cases', count(unlinked), 'Vehicle and policy details needed for screening'],
    ['Model check status', `${count(modelErrors)} errors · ${count(modelLoading)} running`, `${count(modelChecks.filter((result) => result.data).length)} checked; ${count(cases.length - modelChecks.length)} lack model inputs`],
    ['Cost review suggested', count(modelReview), 'Model cost checks flag unusual requests for human review'],
  ]

  return <div className="page-stack risk-workspace">
    <section className="panel panel-large" aria-labelledby="live-risk-heading">
      <div className="panel-header"><div><p className="eyebrow accent">Current workspace</p><h3 id="live-risk-heading">Warranty and financing review</h3></div></div>
      <p className="subcopy">Automatic policy checks and service cost estimates run for linked cases. Financing is reviewed alongside the claim; it does not determine warranty coverage.</p>
      <div className="risk-summary-grid">{metrics.map(([label, value, detail]) => <div className="insight-tile" key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></div>)}</div>
      <BarChart title="Automatic policy screening" description="Live checks against the policy terms entered for each case. These states are separate from the final case decision." rows={policyStates} empty={cases.length === 0} emptyMessage="Create a warranty case to see automatic screening results." />
      <p className="subcopy chart-caption">Checks are rerun from current policy and case details. Ready for review means the entered checks pass; approval still requires an authorised decision.</p>
    </section>

    <section className="panel panel-large" aria-labelledby="account-risk-heading">
      <div className="panel-header"><div><p className="eyebrow accent">Shared vehicle accounts</p><h3 id="account-risk-heading">Review the link between claims and financing</h3></div></div>
      {accounts.length > 0 ? <div className="table-wrap"><table><caption className="risk-table-caption">Figures use entered loan terms and balances. Original principal is not an outstanding loan balance.</caption><thead><tr><th scope="col">Vehicle / owner</th><th scope="col">Original principal</th><th scope="col">Monthly EMI</th><th scope="col">Obligations / income</th><th scope="col">Entered overdue</th><th scope="col">Linked cases</th></tr></thead><tbody>{accounts.map(({ asset, finance, linked }) => <tr key={asset.id}><th scope="row">{vehicleLabel(asset)}<span className="risk-account-owner">{asset.owner}</span></th><td>{Number.isFinite(finance.principal) ? rupees(finance.principal) : 'Check loan terms'}</td><td>{Number.isFinite(finance.emi) ? rupees(finance.emi) : 'Unavailable'}</td><td>{Number.isFinite(finance.monthlyObligationRatio) ? `${finance.monthlyObligationRatio.toFixed(1)}%` : 'Income unavailable'}</td><td>{rupees(safeAmount(asset.overdueAmount))}</td><td>{count(linked.length)} total<span className="risk-account-owner">{count(linked.filter(({ screening }) => screening.state !== 'Ready for review').length)} need policy attention</span></td></tr>)}</tbody></table></div> : <p className="empty-state">Register a vehicle on the Financing page, then link its warranty cases to see the shared account review.</p>}
      <p className="subcopy chart-caption">Monthly obligations combine the estimated vehicle EMI and entered existing EMIs. These are affordability facts, not a predicted default score or warranty eligibility rule.</p>
    </section>

    <section className="panel panel-large" aria-labelledby="historical-service-heading">
      <div className="panel-header"><div><p className="eyebrow accent">Historical service data</p><h3 id="historical-service-heading">Maintenance costs by service interval</h3></div></div>
      <p className="subcopy">{count(data.summary.records)} observed service records. Interval averages help compare estimates with maintenance history; they are not future costs for a specific vehicle.</p>
      <ServiceCostChart rows={data.insights.intervals} />
    </section>

    <section className="panel panel-large" aria-labelledby="historical-credit-heading">
      <div className="panel-header"><div><p className="eyebrow accent">Historical credit reference</p><h3 id="historical-credit-heading">Rechecked dataset indicators</h3></div></div>
      <p className="subcopy">{count(data.credit.records)} separate credit records. This dataset has no customer or vehicle key shared with the service records or your registered accounts.</p>
      <div className="risk-metrics risk-reference-metrics"><div className="insight-tile"><span>Recorded credit scores below 600</span><strong>{count(credit.below600)}</strong><p>Of {count(credit.denominators?.creditScore ?? data.credit.records)} valid score records</p></div><div className="insight-tile"><span>Records with payment bounces</span><strong>{count(credit.withBounces)}</strong><p>Of {count(credit.denominators?.bounceCount ?? data.credit.records)} valid bounce records</p></div><div className="insight-tile"><span>Mean obligations / income</span><strong>{credit.averageObligationRatio}%</strong><p>Across {count(credit.denominators?.obligationRatio ?? data.credit.records)} valid historical ratios</p></div></div>
      <div className="risk-chart-grid"><BarChart title="Recorded credit score distribution" description="Bands count historical credit records, without assigning them to current customers." rows={credit.scoreBands || []} /><BarChart title="Recorded obligations / income" description="Bands use the recorded obligation-to-income ratio from the credit dataset." rows={credit.obligationBands || []} /></div>
      {credit.obligationUnitBasis && <p className="subcopy chart-caption">{credit.obligationUnitBasis}</p>}
      {credit.bandPurpose && <p className="subcopy chart-caption">{credit.bandPurpose}</p>}
    </section>

    {data.safety && <section className="panel panel-large" aria-labelledby="historical-safety-heading">
      <div className="panel-header"><div><p className="eyebrow accent">Additional safety data</p><h3 id="historical-safety-heading">Vehicle configuration ratings</h3></div></div>
      <p className="subcopy">{count(data.safety.records)} deduplicated source configurations across {data.safety.yearRange.min}–{data.safety.yearRange.max}. Body styles and drivetrains are separate observations.</p>
      <div className="risk-metrics risk-reference-metrics"><div className="insight-tile"><span>Rated configurations</span><strong>{count(data.safety.ratedRecords)}</strong><p>Included in star averages and percentages</p></div><div className="insight-tile"><span>Unrated configurations</span><strong>{count(data.safety.unratedRecords)}</strong><p>Excluded from the chart and average</p></div><div className="insight-tile"><span>Matching service vehicles</span><strong>{count(data.safety.matchedServiceVehicles)}</strong><p>Exact make, model and year matches</p></div></div>
      <div className="risk-service-chart"><BarChart title="Overall safety star distribution" description="Historical source ratings. Stars do not measure warranty coverage, credit risk, or claim likelihood." rows={data.safety.starDistribution.map((row) => ({ label: `${row.stars} ${row.stars === 1 ? 'star' : 'stars'}`, records: row.records }))} /></div>
      <p className="subcopy chart-caption">{data.safety.matchedServiceVehicles === 0 ? 'No matching service models were found, so these ratings remain an aggregate reference and are not assigned to your accounts.' : 'Ratings require an exact make, model and year match before they can be attached to a service vehicle.'}</p>
    </section>}
  </div>
}
