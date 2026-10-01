import { useId } from 'react'
import { rupees } from '../utils/actions'

const number = (value) => value.toLocaleString('en-IN')

function ChartTable({ caption, headings, rows }) {
  return <details className="risk-chart-table"><summary>View chart data</summary><div className="table-wrap"><table><caption className="risk-table-caption">{caption}</caption><thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th scope="row" key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div></details>
}

export function BarChart({ title, description, rows = [], empty = false, emptyMessage = 'No records available for this chart.' }) {
  const id = useId()
  const records = rows.filter((row) => typeof row.label === 'string' && Number.isFinite(row.records) && row.records >= 0)
  const total = records.reduce((sum, row) => sum + row.records, 0)
  const maximum = Math.max(1, ...records.map((row) => row.records))
  return <div className="risk-chart" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>{title}</h4>
    <p className="subcopy risk-chart-description">{description}</p>
    {empty || !records.length || total === 0 ? <p className="empty-state">{emptyMessage}</p> : <>
      <div className="risk-bars" role="img" aria-label={`${title}: ${records.map((row) => `${row.label}, ${number(row.records)} records`).join('; ')}. Bars start at zero.`}>
        {records.map((row) => <div className="risk-bar-row" key={row.label}><span className="risk-bar-label">{row.label}</span><div className="risk-bar-track"><span className="risk-bar-fill" style={{ width: `${row.records / maximum * 100}%` }} /></div><strong>{number(row.records)}<small>{(row.records / total * 100).toFixed(1)}%</small></strong></div>)}
      </div>
      <ChartTable caption={`${title}. Counts and percentages of the ${number(total)} records included in these bands.`} headings={['Band / state', 'Records', 'Share']} rows={records.map((row) => [row.label, number(row.records), `${(row.records / total * 100).toFixed(1)}%`])} />
    </>}
  </div>
}

export function ServiceCostChart({ rows = [] }) {
  const id = useId()
  const records = rows.filter((row) => Number.isFinite(row.interval) && Number.isFinite(row.average) && row.average >= 0).toSorted((a, b) => a.interval - b.interval)
  if (!records.length) return <p className="empty-state">No service interval records available.</p>
  const width = 720
  const height = 340
  const plot = { left: 83, right: width - 32, top: 28, bottom: height - 72 }
  const maximum = Math.max(1000, Math.ceil(Math.max(...records.map((row) => row.average)) / 1000) * 1000)
  const minInterval = records[0].interval
  const intervalRange = Math.max(1, records.at(-1).interval - minInterval)
  const x = (interval) => records.length === 1 ? (plot.left + plot.right) / 2 : plot.left + (interval - minInterval) / intervalRange * (plot.right - plot.left)
  const y = (amount) => plot.bottom - amount / maximum * (plot.bottom - plot.top)
  const path = records.map((row, index) => `${index === 0 ? 'M' : 'L'}${x(row.interval)},${y(row.average)}`).join(' ')
  const ticks = Array.from({ length: 5 }, (_, index) => maximum * index / 4)
  return <div className="risk-chart risk-service-chart">
    <div className="risk-svg-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Historical average service cost by service interval</title>
      <desc id={`${id}-description`}>Line graph with INR costs starting at zero, and service intervals in kilometres. {records.map((row) => `${number(row.interval)} kilometres: ${rupees(row.average)} across ${number(row.records)} records`).join('; ')}. Values are averages of historical service bills.</desc>
      {ticks.map((amount) => <g key={amount}><line className="risk-gridline" x1={plot.left} x2={plot.right} y1={y(amount)} y2={y(amount)} /><text className="risk-axis-label" x={plot.left - 12} y={y(amount) + 4} textAnchor="end">₹{number(amount)}</text></g>)}
      <line className="risk-axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
      <line className="risk-axis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
      <path className="risk-cost-line" d={path} />
      {records.map((row) => <g key={row.interval}><circle className="risk-cost-point" cx={x(row.interval)} cy={y(row.average)} r="4.5"><title>{`${number(row.interval)} km: ${rupees(row.average)} (${number(row.records)} records)`}</title></circle><text className="risk-axis-label" x={x(row.interval)} y={plot.bottom + 23} textAnchor="middle">{row.interval / 1000}k</text></g>)}
      <text className="risk-axis-title" x={(plot.left + plot.right) / 2} y={height - 20} textAnchor="middle">Service interval (km)</text>
      <text className="risk-axis-title" x={plot.left} y="16">Average cost (INR)</text>
    </svg></div>
    <p className="subcopy risk-chart-description">The vertical axis starts at ₹0. Points use actual interval spacing; records are not a timeline or an individual vehicle’s cost trend.</p>
    <ChartTable caption="Historical service interval averages from the service dataset." headings={['Interval (km)', 'Records', 'Average cost (INR)']} rows={records.map((row) => [number(row.interval), number(row.records), rupees(row.average)])} />
  </div>
}
