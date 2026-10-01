import { useEffect, useState } from 'react'
import { validateVehicles } from '../utils/vehicleRecords'
const KEY = 'plutus-assets-v1'
function load() {
  try {
    const snapshot = localStorage.getItem(KEY)
    const assets = JSON.parse(snapshot || '[]')
    validateVehicles(assets)
    return { assets, snapshot, error: '' }
  } catch { return { assets: [], snapshot: null, error: 'Vehicle records could not be read. Existing storage has been preserved.' } }
}
export default function useAssets() {
  const [state, setState] = useState(load)
  useEffect(() => {
    const sync = (event) => { if (event.key === KEY || event.key === null) setState(load()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function saveAssets(assets) {
    validateVehicles(assets)
    if (state.error) throw new Error(state.error)
    if (state.snapshot !== localStorage.getItem(KEY)) { setState(load()); throw new Error('Vehicles changed in another tab. Review and retry.') }
    const snapshot = JSON.stringify(assets)
    localStorage.setItem(KEY, snapshot)
    setState({ assets, snapshot, error: '' })
  }
  return { assets: state.assets, error: state.error, saveAssets }
}
