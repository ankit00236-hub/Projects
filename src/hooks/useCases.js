import { useEffect, useState } from 'react'
import { readCases } from '../utils/actions'

const KEY = 'plutus-cases'
function load() {
  try { return { cases: readCases(), error: '', snapshot: localStorage.getItem(KEY) } }
  catch { return { cases: [], error: 'Saved cases could not be read. Existing storage has been preserved; restore browser storage before editing cases.', snapshot: null } }
}
export default function useCases() {
  const [state, setState] = useState(load)
  useEffect(() => {
    function sync(event) { if (event.key === KEY || event.key === null) setState(load()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function saveCases(next) {
    if (state.error) throw new Error(state.error)
    if (localStorage.getItem(KEY) !== state.snapshot) {
      setState(load())
      throw new Error('Cases changed in another tab. Please review the updated queue and try again.')
    }
    const snapshot = JSON.stringify(next)
    localStorage.setItem(KEY, snapshot)
    setState({ cases: next, snapshot, error: '' })
  }
  return { cases: state.cases, storageError: state.error, saveCases }
}
