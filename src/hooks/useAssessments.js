import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../utils/api'
export default function useAssessments(cases, assets) {
  const cache = useRef(new Map())
  const [responses, setResponses] = useState({}), [attempt, setAttempt] = useState(0)
  const fingerprint = JSON.stringify(cases.flatMap((item) => assets.some((asset) => asset.id === item.assetId) && item.defect_code && item.dealer_id && item.claimDate ? [{ id: item.id, body: { defect_code: item.defect_code, dealer_id: item.dealer_id, claim_date: item.claimDate, repair_cost_inr: item.amount } }] : []))
  const requests = useMemo(() => JSON.parse(fingerprint), [fingerprint])
  useEffect(() => {
    let cancelled = false, index = 0
    const controllers = new Set()
    async function worker() {
      while (!cancelled && index < requests.length) {
        const request = requests[index++], key = JSON.stringify(request.body), controller = new AbortController()
        controllers.add(controller)
        const timer = setTimeout(() => controller.abort(), 15000)
        try {
          const result = cache.current.get(key) || await api('/screen-claim', { method: 'POST', body: key, signal: controller.signal })
          if (!Number.isFinite(result.model_score) || result.model_score < 0 || result.model_score > 1) throw new Error('The model returned an invalid score.')
          if (!cancelled) { cache.current.set(key, result); setResponses((previous) => ({ ...previous, [request.id]: { key, data: result } })) }
        } catch (error) {
          if (!cancelled) setResponses((previous) => ({ ...previous, [request.id]: { key, error: controller.signal.aborted ? 'Model check timed out. Retry model checks.' : error.message } }))
        } finally { clearTimeout(timer); controllers.delete(controller) }
      }
    }
    worker(); worker()
    return () => { cancelled = true; controllers.forEach((controller) => controller.abort()) }
  }, [requests, attempt])
  const assessments = Object.fromEntries(requests.map((request) => { const response = responses[request.id]; return [request.id, response?.key === JSON.stringify(request.body) ? response : { loading: true }] }))
  return { assessments, retry: () => { cache.current.clear(); setResponses({}); setAttempt((value) => value + 1) } }
}
