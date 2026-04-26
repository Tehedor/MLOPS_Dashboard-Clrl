const BASE = '/api/lineage'

export const getLineageStatus = () =>
  fetch(`${BASE}/status`).then(r => r.json())

export const getLineageHtml = () =>
  fetch(`${BASE}/html`).then(r => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.text()
  })

export const refreshLineage = () =>
  fetch(`${BASE}/refresh`, { method: 'POST' }).then(r => r.json())
