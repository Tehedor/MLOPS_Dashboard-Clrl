const BASE = '/api/services'

export const getServices = () =>
  fetch(BASE).then(r => r.json())

export const getServiceStatus = (serviceId) =>
  fetch(`${BASE}/${serviceId}/status`).then(r => r.json())

export const runCommand = (serviceId, command, env = {}) =>
  fetch(`${BASE}/${serviceId}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, env }),
  }).then(async r => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.detail || 'Command failed')
    }
    return r.json()
  })
