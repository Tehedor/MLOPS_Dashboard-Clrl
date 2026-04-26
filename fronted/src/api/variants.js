const BASE = '/api/variants'

export const getPhases = () =>
  fetch(`${BASE}/phases`).then(r => r.json())

export const getTableConfig = (phase) =>
  fetch(`${BASE}/table-config/${phase}`).then(r => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  })

export const getRows = ({ phase, limit = 50, offset = 0, q = '', sort_by = 'variant', sort_dir = 'asc', col_filters = {} }) => {
  const p = new URLSearchParams({ phase, limit, offset, q, sort_by, sort_dir })
  const activeFilters = Object.fromEntries(Object.entries(col_filters).filter(([, v]) => v))
  if (Object.keys(activeFilters).length > 0) p.set('col_filters', JSON.stringify(activeFilters))
  return fetch(`${BASE}/rows?${p}`).then(r => r.json())
}

export const pullVariant = (phase, variant) =>
  fetch(`${BASE}/local/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, variant }),
  }).then(r => r.json())

export const deleteVariant = (phase, variant) =>
  fetch(`${BASE}/local/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, variant }),
  }).then(r => r.json())

export const syncVariants = (phase) =>
  fetch(`${BASE}/sync${phase ? `?phase=${phase}` : ''}`, { method: 'POST' })
    .then(r => r.json())

export const getJob = (jobId) =>
  fetch(`${BASE}/jobs/${jobId}`).then(r => r.json())

export const getSyncInterval = () =>
  fetch(`${BASE}/sync-interval`).then(r => r.json())
