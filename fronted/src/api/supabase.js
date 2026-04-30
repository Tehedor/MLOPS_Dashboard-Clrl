import { createClient } from '@supabase/supabase-js'

let _client = null

export function initSupabase(url, anonKey) {
  if (url && anonKey) {
    // El SDK añade /rest/v1 internamente. Si el usuario copió la URL del
    // Data API endpoint (...supabase.co/rest/v1/) hay que recortar el sufijo.
    const baseUrl = url.replace(/\/rest\/v1\/?$/, '')
    _client = createClient(baseUrl, anonKey)
  }
}

export function getSupabase() {
  return _client
}

export const isConfigured = () => _client !== null

// ── Mapeo workflow_runs → shape de ejecución local ───────────────────────────

function _mapStatus(run) {
  if (run.conclusion === 'success')   return 'success'
  if (run.conclusion === 'failure')   return 'failed'
  if (run.conclusion === 'cancelled') return 'canceled'
  if (run.status === 'in_progress')   return 'running'
  return 'queued'
}

function _extractFase(run) {
  if (run.fase) return run.fase
  const m = (run.workflow_name ?? '').match(/fase(\d+)/i)
  if (m) return `f${String(parseInt(m[1])).padStart(2, '0')}`
  return run.workflow_name ?? '?'
}

export async function fetchRunsAsExecutions(limit = 100) {
  if (!_client) return []
  const { data, error } = await _client
    .from('workflow_runs')
    .select('*')
    .not('fase', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(run => ({
    id:         String(run.run_id),
    fase:       _extractFase(run),
    variant:    run.variant ?? '—',
    parent:     null,
    runner:     'GithubActions',
    params:     '{}',
    status:     _mapStatus(run),
    error_code: run.conclusion === 'failure' ? 'gh_failed' : null,
    gh_run_id:  String(run.run_id),
    created_at: run.created_at ?? new Date().toISOString(),
    updated_at: run.updated_at ?? new Date().toISOString(),
    _source:    'supabase',
  }))
}

export async function fetchRuns(limit = 50) {
  const { data, error } = await _client
    .from('workflow_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function fetchLogs(runId) {
  const { data, error } = await _client
    .from('workflow_logs')
    .select('*')
    .eq('run_id', runId)
    .order('ts', { ascending: true })
    .order('line_no', { ascending: true })
  if (error) throw error
  return data
}

export function subscribeRuns(handler) {
  return _client
    .channel('workflow_runs_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_runs' }, handler)
    .subscribe()
}

export function subscribeLogs(runId, handler) {
  return _client
    .channel(`workflow_logs:${runId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'workflow_logs',
      filter: `run_id=eq.${runId}`,
    }, handler)
    .subscribe()
}
