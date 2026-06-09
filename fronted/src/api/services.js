const BASE = '/api/services'

export const getServices = (pipelineId) =>
  fetch(`${BASE}?pipeline_id=${encodeURIComponent(pipelineId)}`).then(r => r.json())

export const getServiceStatus = (serviceId, pipelineId) =>
  fetch(`${BASE}/${serviceId}/status?pipeline_id=${encodeURIComponent(pipelineId)}`).then(r => r.json())

export const runCommand = (serviceId, pipelineId, command, env = {}) =>
  fetch(`${BASE}/${serviceId}/command?pipeline_id=${encodeURIComponent(pipelineId)}`, {
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
