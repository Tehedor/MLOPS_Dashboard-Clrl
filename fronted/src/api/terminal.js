export async function getRunners() {
  const res = await fetch('/api/runners')
  if (!res.ok) throw new Error('Failed to fetch runners')
  return res.json()
}

export async function getRunnersConfig() {
  const res = await fetch('/api/runners/config')
  if (!res.ok) throw new Error('Failed to fetch runners config')
  return res.json()
}

export async function updateRunnerConfig(runnerId, { url, username, password }) {
  const body = {}
  if (url      !== undefined) body.url      = url
  if (username !== undefined) body.username = username
  if (password !== undefined) body.password = password
  const res = await fetch(`/api/runners/${runnerId}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Failed to update runner config: ${res.statusText}`)
  return res.json()
}

export function createTerminalWS(runnerId) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return new WebSocket(`${proto}//${host}/ws/terminal/${runnerId}`)
}
