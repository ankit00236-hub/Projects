import { useEffect, useState } from 'react'
import { api } from '../utils/api'
import BrandMark from './BrandMark'
export default function AccountGate({ children }) {
  const [user, setUser] = useState(null), [checking, setChecking] = useState(true), [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  useEffect(() => {
    let active = true
    api('/auth/me').then((next) => { if (active) setUser(next) }).catch((e) => { if (active && e.status !== 401) setError(e.message) }).finally(() => { if (active) setChecking(false) })
    const expire = () => setUser(null)
    window.addEventListener('plutus-session-expired', expire)
    return () => { active = false; window.removeEventListener('plutus-session-expired', expire) }
  }, [])
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try { setUser(await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) })) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); setUser(null); setError('') }
    catch (e) { setError(e.message) }
  }
  if (checking) return <main className="auth-loading"><BrandMark /><p role="status">Opening your workspace…</p></main>
  if (user) return <><div className="account-bar"><span><span className="sync-dot" aria-hidden="true" /> Workspace account · <b>{user.username}</b></span><button className="ghost-button small" onClick={logout}>Sign out</button>{error && <span role="alert">{error}</span>}</div>{children}</>
  return <main className="auth-page">
    <header className="auth-header"><a className="auth-brand" href="#/overview" aria-label="Plutus Auto home"><BrandMark /><span>Plutus<span className="brand-auto">Auto</span></span></a><span className="auth-header-caption">A clearer road ahead</span></header>
    <div className="auth-layout">
      <section className="auth-story" aria-labelledby="welcome-heading">
        <div className="auth-kicker"><span aria-hidden="true" /> Warranty &amp; financing, together</div>
        <h1 id="welcome-heading">A clearer view.<br /><span>Of every drive.</span></h1>
        <p className="auth-intro">Manage vehicles, warranty policies, claims, and financing in one connected workspace, with model-assisted review when supporting data is available.</p>
        <div className="horizon-art" aria-hidden="true"><div className="horizon-sun" /><div className="horizon-ridge ridge-back" /><div className="horizon-ridge ridge-front" /><div className="horizon-water" /><div className="horizon-line" /><span className="horizon-label">Clarity, from here onward.</span></div>
        <div className="auth-features"><div><span>01 /</span><strong>Warranty management</strong></div><div><span>02 /</span><strong>Vehicle financing</strong></div><div><span>03 /</span><strong>Integrated review</strong></div></div>
      </section>
      <section className="auth-card" aria-labelledby="account-heading">
        <div className="auth-card-top"><span className="eyebrow accent">Your workspace</span><span className="auth-card-symbol" aria-hidden="true">↗</span></div>
        <h2 id="account-heading">{register ? 'Start with clarity.' : 'Welcome back.'}</h2>
        <p className="auth-card-intro">{register ? 'Create an account. Make room for the road ahead.' : 'Sign in and pick up where you left off.'}</p>
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <label htmlFor="account-username">Username</label><input id="account-username" name="username" placeholder="Your username" autoComplete="username" required minLength={3} maxLength={80} pattern="[a-zA-Z0-9_.@\-]+" disabled={busy} />
          <label htmlFor="account-password">Password</label><div className="password-field"><input id="account-password" name="password" type={showPassword ? 'text' : 'password'} placeholder="At least 12 characters" autoComplete={register ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} disabled={busy} aria-describedby="password-help" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button></div>
          <p id="password-help" className="auth-help">Keep your password safe. Password recovery is not available yet.</p>
          {error && <p role="alert" className="auth-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={busy}><span>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</span><span aria-hidden="true">→</span></button>
        </form>
        <div className="auth-divider"><span>{register ? 'Already part of Plutus?' : 'New to Plutus?'}</span><button type="button" className="auth-switch" disabled={busy} onClick={() => { setRegister(!register); setError(''); setShowPassword(false) }}>{register ? 'Sign in' : 'Create an account'} <span aria-hidden="true">↗</span></button></div>
        <p className="auth-privacy"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><rect x="5" y="9" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="1.5" /></svg> Your records stay private to your account.</p>
      </section>
    </div>
    <footer className="auth-footer"><span>Designed for the journey.</span><span>Plutus Auto · Warranty &amp; financing</span></footer>
  </main>
}
