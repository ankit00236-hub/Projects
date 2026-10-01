import data from '../data/trainingData.json'
import { rupees, title } from '../utils/actions'
export default function PortfolioPage() {
return (        <article className="panel panel-large bottom-panel" id="portfolio"><div className="panel-header"><div><p className="eyebrow">Service training portfolio</p><h3>Costs by model</h3></div></div><div className="table-wrap"><table><thead><tr><th>Model</th><th>Service records</th><th>Average cost (INR)</th></tr></thead><tbody>{data.portfolio.map((p) => <tr key={p.model}><td>{title(p.model)}</td><td>{p.units.toLocaleString('en-IN')}</td><td>{rupees(p.average)}</td></tr>)}</tbody></table></div></article>)
}
