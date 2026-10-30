export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Plutus-Request': '1', ...options.headers }, signal: options.signal || AbortSignal.timeout(15000) })
  const result = await response.json()
  if (!response.ok) {
    const error = new Error(typeof result.detail === 'string' ? result.detail : 'Check the entered fields and try again.')
    error.status = response.status
    if (response.status === 401) window.dispatchEvent(new Event('plutus-session-expired'))
    throw error
  }
  return result
}
