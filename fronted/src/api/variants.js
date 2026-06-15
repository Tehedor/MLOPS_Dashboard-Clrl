const BASE = '/api/variants'

export const getPhases = (pipelineId) =>
  fetch(`${BASE}/phases?pipeline_id=${encodeURIComponent(pipelineId)}`).then(r => r.json())

export const getTableConfig = (phase, pipelineId) =>
  fetch(`${BASE}/table-config/${phase}?pipeline_id=${encodeURIComponent(pipelineId)}`).then(r => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  })

export const getRows = ({ phase, pipeline_id, limit = 50, offset = 0, q = '', sort_by = 'variant', sort_dir = 'asc', col_filters = {} }) => {
  const p = new URLSearchParams({ phase, pipeline_id, limit, offset, q, sort_by, sort_dir })
  const activeFilters = Object.fromEntries(Object.entries(col_filters).filter(([, v]) => v))
  if (Object.keys(activeFilters).length > 0) p.set('col_filters', JSON.stringify(activeFilters))
  return fetch(`${BASE}/rows?${p}`).then(r => r.json())
}

export const pullVariant = (phase, variant, pipeline_id) =>
  fetch(`${BASE}/local/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, variant, pipeline_id }),
  }).then(r => r.json())

export const deleteVariant = (phase, variant, pipeline_id) =>
  fetch(`${BASE}/local/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, variant, pipeline_id }),
  }).then(r => r.json())

export const deleteVariantRepo = (phase, variant, pipeline_id) =>
  fetch(`${BASE}/repo/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, variant, pipeline_id }),
  }).then(r => r.json())

export const syncVariants = (pipeline_id, phase) => {
  const params = new URLSearchParams({ pipeline_id })
  if (phase) params.set('phase', phase)
  return fetch(`${BASE}/sync?${params}`, { method: 'POST' }).then(r => r.json())
}

export const checkVariantExists = (phase, variant, pipeline_id) =>
  fetch(`${BASE}/exists?phase=${encodeURIComponent(phase)}&variant=${encodeURIComponent(variant)}&pipeline_id=${encodeURIComponent(pipeline_id)}`)
    .then(r => r.json())

export const getJob = (jobId) =>
  fetch(`${BASE}/jobs/${jobId}`).then(r => r.json())

export const getSyncInterval = () =>
  fetch(`${BASE}/sync-interval`).then(r => r.json())
