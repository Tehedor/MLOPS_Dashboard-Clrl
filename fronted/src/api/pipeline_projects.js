const BASE = '/api/pipeline-projects'
const _cache = { data: null, timestamp: 0 }

export async function getPipelineProjects() {
  const now = Date.now()
  const cacheAge = now - _cache.timestamp
  const useCached = _cache.data && cacheAge < 60000

  if (useCached) return _cache.data

  const res = await fetch(BASE)
  if (!res.ok) throw new Error('Failed to fetch pipeline projects')
  const json = await res.json()
  _cache.data = json
  _cache.timestamp = Date.now()
  return json
}

export async function getPipelineProject(pipelineId) {
  const res = await fetch(`${BASE}/${pipelineId}`)
  if (!res.ok) throw new Error(`Pipeline project '${pipelineId}' not found`)
  return res.json()
}
