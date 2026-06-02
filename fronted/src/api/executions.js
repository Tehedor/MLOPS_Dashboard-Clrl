const BASE = '/api/executions'

export async function getPhases() {
  try {
    const res = await fetch(`${BASE}/phases`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function getExecutions(pipelineId) {
  const url = pipelineId ? `${BASE}?pipeline_id=${encodeURIComponent(pipelineId)}` : BASE
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch executions')
  return res.json()
}

export async function createExecution(data) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    let detail = `Error ${res.status}`
    try { detail = (await res.json()).detail ?? detail } catch {}
    throw Object.assign(new Error(detail), { status: res.status })
  }
  return res.json()
}

export async function cancelExecution(id) {
  const res = await fetch(`${BASE}/${id}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to cancel execution')
  return res.json()
}

export async function retryExecution(id) {
  const res = await fetch(`${BASE}/${id}/retry`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to retry execution')
  return res.json()
}

export async function getQueueStatus() {
  const res = await fetch(`${BASE}/queue/status`)
  if (!res.ok) throw new Error('Failed to fetch queue status')
  return res.json()
}

export async function pauseQueue() {
  const res = await fetch(`${BASE}/queue/pause`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to pause queue')
  return res.json()
}

export async function resumeQueue() {
  const res = await fetch(`${BASE}/queue/resume`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to resume queue')
  return res.json()
}
