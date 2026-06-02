const BASE = '/api/pipeline-projects'

export const getBranchStatus = (pipelineId) =>
  fetch(`${BASE}/${pipelineId}/branch-status`).then(r => r.json())

export const createBranch = (pipelineId, baseBranch = 'main') =>
  fetch(`${BASE}/${pipelineId}/create-branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_branch: baseBranch }),
  }).then(async r => {
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error(data.detail ?? `Error ${r.status}`)
    }
    return r.json()
  })

export const startSetup = (pipelineId) =>
  fetch(`${BASE}/${pipelineId}/setup/start`, { method: 'POST' }).then(r => r.json())

export const getSetupStatus = (pipelineId) =>
  fetch(`${BASE}/${pipelineId}/setup/status`).then(r => r.json())

export function subscribeSetupLogs(pipelineId, onLine, onDone) {
  const es = new EventSource(`${BASE}/${pipelineId}/setup/stream`)
  es.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.done) {
      es.close()
      onDone?.(data.status)
    } else if (data.line !== undefined) {
      onLine?.(data.line)
    }
  }
  es.onerror = () => es.close()
  return () => es.close()
}
