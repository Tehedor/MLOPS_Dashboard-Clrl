const BASE = '/api/lineage'

// ── Legacy HTML endpoints (kept for backward compat) ─────────────────────────

export const getLineageStatus = (pipelineId) =>
  fetch(`${BASE}/status?pipeline_id=${encodeURIComponent(pipelineId)}`).then(r => r.json())

export const getLineageHtml = (pipelineId) =>
  fetch(`${BASE}/html?pipeline_id=${encodeURIComponent(pipelineId)}`).then(r => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.text()
  })

export const refreshLineage = (pipelineId) =>
  fetch(`${BASE}/refresh?pipeline_id=${encodeURIComponent(pipelineId)}`, { method: 'POST' }).then(r => r.json())

// ── Registry endpoints ────────────────────────────────────────────────────────

export const getLineageRegistry = (pipelineId) =>
  fetch(`${BASE}/registry?pipeline_id=${encodeURIComponent(pipelineId)}`).then(r => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  })

export const syncLineageRegistry = (pipelineId) =>
  fetch(`${BASE}/registry/sync?pipeline_id=${encodeURIComponent(pipelineId)}`, { method: 'POST' }).then(r => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  })

export const getLineageConfig = () =>
  fetch(`${BASE}/config`).then(r => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  })

export const getStaticLineageHtml = (pipelineId) =>
  fetch(`${BASE}/static-html?pipeline_id=${encodeURIComponent(pipelineId)}`).then(r => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.text()
  })
