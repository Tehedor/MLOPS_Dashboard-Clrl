const BASE = '/api/pipeline-projects'

export async function getPipelineProjects() {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error('Failed to fetch pipeline projects')
  return res.json()
}

export async function getPipelineProject(pipelineId) {
  const res = await fetch(`${BASE}/${pipelineId}`)
  if (!res.ok) throw new Error(`Pipeline project '${pipelineId}' not found`)
  return res.json()
}
