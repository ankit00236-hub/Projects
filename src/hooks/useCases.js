import useRecords from './useRecords'
export default function useCases() {
  const state = useRecords('cases')
  return { cases: state.records, reload: state.reload, loaded: state.loaded, storageError: state.error, saveCases: state.save }
}
