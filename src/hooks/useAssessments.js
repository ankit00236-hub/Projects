import { useEffect, useMemo, useRef, useState } from 'react'
import data from '../data/trainingData.json'
import { assessmentService } from '../utils/warranty'

export default function useAssessments(cases, assets) {
  const cache = useRef(new Map())
  const [responses, setResponses] = useState({})
  const [attempt, setAttempt] = useState(0)
  const fingerprint = JSON.stringify(cases.flatMap((item) => {
    const asset = assets.find((a) => a.id === item.assetId)
    return asset && Number.isFinite(item.mileage) && data.flags.includes(item.claimKey)
      ? [{ id: item.id, body: { service: assessmentService(item, asset, data.flags), requested_amount: item.amount } }] : []
  }))
  const requests = useMemo(() => JSON.parse(fingerprint), [fingerprint])
  useEffect(() => {
    let cancelled = false
    const controllers = new Set()
    // Two requests at a time keep large local queues from flooding the API.
    let index = 0
    async function worker() {
      while (!cancelled && index < requests.length) {
        const request = requests[index++]
        const key = JSON.stringify(request.body)
        const controller = new AbortController()
        controllers.add(controller)
        const timeout = setTimeout(() => controller.abort(), 15000)
        try {
          const cached = cache.current.get(key)
          if (cached) {
            await Promise.resolve()
            if (!cancelled) setResponses((previous) => ({ ...previous, [request.id]: { key, data: cached } }))
            continue
          }
          const response = await fetch('/api/assess-warranty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: controller.signal })
          const result = await response.json()
          if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Assessment inputs were rejected.')
          if (!Number.isFinite(result.predicted_service_cost) || !['review', 'within_estimate'].includes(result.triage)) throw new Error('Assessment response was invalid.')
          if (!cancelled) { cache.current.set(key, result); setResponses((previous) => ({ ...previous, [request.id]: { key, data: result } })) }
        } catch (failure) {
          if (!cancelled) setResponses((previous) => ({ ...previous, [request.id]: { key, error: failure.name === 'AbortError' ? 'Estimate timed out. Retry the model check.' : failure instanceof TypeError || failure instanceof SyntaxError ? 'Model check unavailable. Start the backend or retry. Policy checks still run locally.' : failure.message } }))
        } finally { clearTimeout(timeout); controllers.delete(controller) }
      }
    }
    worker(); worker()
    return () => { cancelled = true; controllers.forEach((c) => c.abort()) }
  }, [requests, attempt])
  const assessments = Object.fromEntries(requests.map((request) => {
    const response = responses[request.id]
    return [request.id, response?.key === JSON.stringify(request.body) ? response : { loading: true }]
  }))
  return { assessments, retry: () => { cache.current.clear(); setResponses({}); setAttempt((n) => n + 1) } }
}
