import useRecords from './useRecords'
import { validateVehicles } from '../utils/vehicleRecords'
export default function useAssets() {
  const state = useRecords('assets')
  return { assets: state.records, reload: state.reload, loaded: state.loaded, error: state.error, saveAssets: async (assets) => { validateVehicles(assets); await state.save(assets) } }
}
