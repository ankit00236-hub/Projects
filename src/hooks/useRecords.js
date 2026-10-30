import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../utils/api'
export default function useRecords(collection) {
  const [state, setState] = useState({ records: [], revision: 0, loaded: false, error: '' })
  const latest = useRef(state), saving = useRef(false), active = useRef(true), sequence = useRef(0)
  const invalidate = useCallback(() => { sequence.current++ }, [])
  function update(next) { latest.current = next; if (active.current) setState(next) }
  const reload = useCallback(async () => {
    if (saving.current) return
    const request = ++sequence.current
    try {
      const next = await api(`/records/${collection}`)
      if (active.current && !saving.current && request === sequence.current) update({ ...next, loaded: true, error: '' })
    } catch (error) { if (active.current && request === sequence.current) update({ ...latest.current, error: error.message }) }
  }, [collection])
  useEffect(() => {
    active.current = true; reload()
    window.addEventListener('focus', reload)
    const timer = setInterval(reload, 30000)
    return () => { active.current = false; invalidate(); clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [reload, invalidate])
  async function save(records) {
    if (!latest.current.loaded) throw new Error('Wait for saved records to load.')
    if (saving.current) throw new Error('A save is already in progress. Please wait.')
    saving.current = true; sequence.current++
    try {
      const next = await api(`/records/${collection}`, { method: 'PUT', body: JSON.stringify({ records, revision: latest.current.revision }) })
      update({ ...next, loaded: true, error: '' })
    } catch (error) {
      update({ ...latest.current, error: error.message }); saving.current = false
      if (error.status === 409) await reload()
      throw error
    } finally { saving.current = false }
  }
  return { ...state, save, reload }
}
