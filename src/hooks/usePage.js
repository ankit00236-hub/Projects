import { useEffect, useState } from 'react'
import { pageFromHash } from '../utils/navigation'

export default function usePage() {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash))
  useEffect(() => {
    const update = () => setPage(pageFromHash(window.location.hash))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    document.title = `${page.charAt(0).toUpperCase() + page.slice(1)} | Plutus Auto`
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.getElementById('page-content')?.focus({ preventScroll: true })
  }, [page])
  return { page, navigate: (target) => { window.location.hash = `/${target}` } }
}
