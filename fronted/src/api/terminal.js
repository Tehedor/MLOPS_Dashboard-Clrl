export async function getRunners() {
  const res = await fetch('/api/runners')
  if (!res.ok) throw new Error('Failed to fetch runners')
  return res.json()
}

export function createTerminalWS(runnerId) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return new WebSocket(`${proto}//${host}/ws/terminal/${runnerId}`)
}
