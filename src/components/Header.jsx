import plutusLogo from '../assets/plutus-logo.png'
import { title } from '../utils/actions'

const sections = ['overview', 'warranty', 'financing', 'risk', 'reports', 'notes', 'portfolio']

export default function Header({ page, onExport, onNewCase, theme, onToggleTheme }) {
  return (
    <header className="topbar">
      <div className="brand-wrap">
        <a className="brand-logo" href="#/overview" aria-label="Plutus home">
          <img src={plutusLogo} alt="" width="1254" height="1254" />
        </a>
        <div className="brand-copy">
          <h1>Plutus Auto</h1>
          <p>Warranty &amp; financing</p>
        </div>
      </div>
      <nav className="main-nav" aria-label="Main navigation">
        {sections.map((id) => <a key={id} href={`#/${id}`} aria-current={page === id ? 'page' : undefined}>{title(id)}</a>)}
      </nav>
      <div className="header-actions">
        <button type="button" className="ghost-button theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
        <button type="button" className="ghost-button" onClick={onExport}>Export</button>
        <button type="button" className="primary-button" onClick={onNewCase}>New case</button>
      </div>
    </header>
  )
}
