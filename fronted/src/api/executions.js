const BASE = '/api/executions'

export async function getPhases() {
  try {
    console.log('Fetching phases from:', `${BASE}/phases`)
    const res = await fetch(`${BASE}/phases`)
    if (!res.ok) {
      console.error('Failed to fetch phases:', res.status, res.statusText)
      return []
    }
    const data = await res.json()
    console.log('Phases loaded:', data)
    return data
  } catch (err) {
    console.error('Error fetching phases:', err)
    return []
  }
}

export async function getExecutions() {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error('Failed to fetch executions')
  return res.json()
}

export async function createExecution(data) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create execution')
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
