import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchRuns, getSupabase, isConfigured, subscribeRuns } from '../api/supabase'
import { getPipelineProjects } from '../api/pipeline_projects'
import RunList from '../features/logs/RunList'
import LogViewer from '../features/logs/LogViewer'

const ALL_STATUSES = ['all', 'queued', 'in_progress', 'success', 'failure', 'cancelled']

// Caché a nivel de módulo: sobrevive al desmontaje del componente (cambio de tab/página)
const _ghLogsCache  = {}
const _ghLoadingSet = new Set()

function _mapLocalStatus(s) {
  return { running: 'in_progress', failed: 'failure', canceled: 'cancelled' }[s] ?? s
}

function _toRunShape(ex) {
  const status = _mapLocalStatus(ex.status)
  return {
    run_id:        ex.id,
    workflow_name: `Local: ${ex.fase}/${ex.variant}`,
    branch:        null,
    status,
    conclusion:    ['success', 'failure', 'cancelled'].includes(status) ? status : null,
    fase:          ex.fase,
    variant:       ex.variant,
    created_at:    ex.created_at,
    pipeline_id:   ex.pipeline_id ?? null,
    _source:       'local',
  }
}

export default function LogsRunners() {
  const [searchParams] = useSearchParams()
  const [runs, setRuns] = useState([])
  const [localRuns, setLocalRuns] = useState([])
  const [selectedRun, setSelectedRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState(() => searchParams.get('run_id') ?? '')
  const [projects, setProjects] = useState([])

  useEffect(() => {
    getPipelineProjects().then(setProjects).catch(() => {})
  }, [])

  const pipelineProjects = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p])),
    [projects]
  )
  const branchMap = useMemo(
    () => Object.fromEntries(projects.filter(p => p.branch).map(p => [p.branch, p.id])),
    [projects]
  )
  const [, forceUpdate] = useState(0)   // solo para forzar re-render cuando cambia la caché

  async function fetchGhLogs(runId) {
    if (!runId || _ghLoadingSet.has(runId)) return
    _ghLoadingSet.add(runId)
    forceUpdate(n => n + 1)
    try {
      const resp = await fetch(`/api/executions/gh-logs/${runId}`)
      if (!resp.ok) throw new Error(resp.statusText)
      _ghLogsCache[runId] = await resp.json()
    } catch (e) {
      console.error('gh logs fetch error:', e)
    } finally {
      _ghLoadingSet.delete(runId)
      forceUpdate(n => n + 1)
    }
  }

  if (!isConfigured()) {
    return (
      <div className="flex items-center justify-center h-full text-center p-8">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Supabase no configurado
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Añade <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> al <code>.env</code>.
          </p>
        </div>
      </div>
    )
  }

  useEffect(() => {
    fetchRuns()
      .then((data) => {
        setRuns(data)
        if (data.length) setSelectedRun(prev => prev ?? data[0])
      })
      .catch(console.error)
      .finally(() => setLoading(false))

    const channel = subscribeRuns((payload) => {
      const updated = payload.new
      setRuns((prev) => {
        const idx = prev.findIndex((r) => r.run_id === updated.run_id)
        if (idx === -1) return [updated, ...prev]
        const next = [...prev]
        next[idx] = updated
        return next
      })
      setSelectedRun((prev) => prev?.run_id === updated.run_id ? updated : prev)
    })

    return () => { getSupabase()?.removeChannel(channel) }
  }, [])

  // Local runs — poll every 5 s so status updates appear
  useEffect(() => {
    function load() {
      fetch('/api/executions')
        .then(r => r.json())
        .then(data => {
          const shaped = data.map(_toRunShape)
          setLocalRuns(shaped)
          // Select first run on initial load if nothing is selected yet
          setSelectedRun(prev => prev ?? shaped[0] ?? null)
        })
        .catch(console.error)
    }
    load()
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [])

  const enrichedRuns = useMemo(
    () => runs.map(r => ({
      ...r,
      pipeline_id: r.pipeline_id ?? (r.branch ? branchMap[r.branch] : null) ?? null,
    })),
    [runs, branchMap]
  )

  const allRuns = [...enrichedRuns, ...localRuns].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )

  const filtered = allRuns.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        String(r.run_id ?? '').includes(q) ||
        r.workflow_name?.toLowerCase().includes(q) ||
        r.branch?.toLowerCase().includes(q) ||
        r.fase?.toLowerCase().includes(q) ||
        r.variant?.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-950">
        <input
          type="search"
          placeholder="Buscar por workflow, rama, fase…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1 w-52 outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex gap-1">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {s === 'all' ? 'Todos' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-600">
          {filtered.length} run{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Main panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: run list */}
        <div className="w-72 shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
          <RunList
            runs={filtered}
            selectedRunId={selectedRun?.run_id}
            onSelect={setSelectedRun}
            loading={loading}
            pipelineProjects={pipelineProjects}
          />
        </div>

        {/* Right: log viewer */}
        <div className="flex-1 overflow-hidden relative">
          <LogViewer
            run={selectedRun}
            ghLogsCache={_ghLogsCache}
            ghLoadingSet={_ghLoadingSet}
            onFetchGhLogs={fetchGhLogs}
          />
        </div>
      </div>
    </div>
  )
}
