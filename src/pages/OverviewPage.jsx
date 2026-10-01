import data from '../data/trainingData.json'
import { OverviewInsights } from '../components/Insights'

export default function OverviewPage({ cases, stats, navigate, reviewQueue }) {
  return <>
      <section className="hero-panel panel"><div className="hero-copy"><p className="eyebrow accent">Integrated automotive management</p><h2>Protect every drive. Finance the journey.</h2><p className="subcopy">Manage automotive warranty claims, plan vehicle financing, estimate service costs, and keep dealer follow-ups in one workspace.</p><div className="hero-actions"><button className="primary-button" onClick={reviewQueue}>Review today’s queue</button><button className="ghost-button" onClick={() => navigate('portfolio')}>Open portfolio</button></div></div><div className="hero-indicators"><div className="mini-card"><span>Supported models</span><strong>{data.portfolio.length}</strong><em>Honda and Toyota</em></div><div className="mini-card"><span>Training vehicle years</span><strong>2016–2018</strong><em>Chennai and Mumbai</em></div></div></section>
      <section className="stats-grid">{stats.map(([label, value]) => <article className="stat-card panel" key={label}><div className="stat-header">{label}</div><strong>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</strong></article>)}</section>
      <OverviewInsights cases={cases} />
    </>
}
