import { useState } from 'react'
export default function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [error, setError] = useState('')
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
    try { localStorage.setItem('plutus-theme', next); setError('') }
    catch { setError('Theme changed for this session; browser storage is unavailable.') }
  }
  return { theme, error, toggleTheme }
}
