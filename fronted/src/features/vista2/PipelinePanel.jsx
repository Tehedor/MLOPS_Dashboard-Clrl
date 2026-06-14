import { useEffect, useRef, useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { cancelExecution, retryExecution, getQueueStatus, pauseQueue, resumeQueue } from '../../api/executions'
import StatusBadge from './StatusBadge'
import ParamsChips from './ParamsChips'

// ---------------------------------------------------------------------------
// LocalLogViewer — streams /api/executions/{id}/local-logs/stream via SSE
// ---------------------------------------------------------------------------
function LocalLogViewer({ executionId, active }) {
  const [groups, setGroups] = useState({})  // { step: [line, ...] }
  const [done, setDone]     = useState(false)
  const containerRef        = useRef(null)
  const atBottomRef         = useRef(true)

  useEffect(() => {
    if (!executionId) return
    setGroups({})
    setDone(false)
    atBottomRef.current = true

    const es = new EventSource(`/api/executions/${executionId}/local-logs/stream`)

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.done) { setDone(true); es.close(); return }
      const { step, line } = data
      setGroups(prev => {
        const next = { ...prev }
        if (!next[step]) next[step] = []
        next[step] = [...next[step], line]
        return next
      })
    }

    es.onerror = () => es.close()
    return () => es.close()
  }, [executionId])

  useEffect(() => {
    if (atBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [groups])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const stepEntries = Object.entries(groups)

  return (
    <div className="mt-2 rounded border border-gray-700 overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-900 border-b border-gray-700">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Local logs
        </span>
        {active && !done && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-yellow-500">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            LIVE
          </span>
        )}
        {done && <span className="text-[10px] text-green-500 font-semibold">DONE</span>}
      </div>
      {/* log body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="font-mono text-[11px] bg-gray-950 text-gray-300 overflow-y-auto"
        style={{ maxHeight: '260px' }}
      >
        {stepEntries.length === 0 && (
          <p className="px-2 py-2 text-gray-600 italic text-[11px]">Esperando logs…</p>
        )}
        {stepEntries.map(([step, lines]) => (
          <div key={step} className="mb-2">
            <div className="px-2 py-0.5 text-[9px] font-semibold text-gray-500 uppercase tracking-widest bg-gray-900 border-b border-gray-800">
              ▶ {step}
            </div>
            {lines.map((line, i) => (
              <div key={i} className="px-2 py-px whitespace-pre-wrap break-all leading-4">
                {line}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function pipelineChipStyle(color) {
  if (!color) return {}
  return { backgroundColor: color + '22', borderColor: color + '88', color }
}

function PipelineChip({ project, fallback }) {
  const label = project?.label ?? fallback
  const color = project?.color
  if (color) {
    return (
      <span
        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono border"
        style={pipelineChipStyle(color)}
      >
        {label}
      </span>
    )
  }
  return (
    <span className="shrink-0 bg-indigo-100 border border-indigo-300 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded dark:bg-indigo-900/40 dark:border-indigo-700 dark:text-indigo-300 font-mono">
      {label}
    </span>
  )
}

function fmtDuration(startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso)
  if (isNaN(ms) || ms < 0) return null
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function fmtElapsed(secs) {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  if (m < 60) return `${m}m ${secs % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function RunningTimer({ startIso }) {
  const [elapsed, setElapsed] = useState(() =>
    startIso ? Math.max(0, Math.floor((Date.now() - new Date(startIso)) / 1000)) : 0
  )
  useEffect(() => {
    if (!startIso) return
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startIso)) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [startIso])
  return (
    <span className="text-xs font-mono text-green-600 dark:text-green-400">
      {fmtElapsed(elapsed)}
    </span>
  )
}

const ACTIVE_STATES = new Set(['queued', 'waiting_parent', 'waiting_runner', 'dispatching', 'running'])

// Priority order for status sort: lower index = higher priority
const STATUS_RANK = { running: 0, dispatching: 1, waiting_runner: 2, waiting_parent: 3, queued: 4 }
const STATUS_META = {
  running:        { label: 'Running',      color: 'bg-green-100  text-green-700  border-green-300  dark:bg-green-900/40  dark:text-green-300  dark:border-green-700' },
  dispatching:    { label: 'Dispatching',  color: 'bg-blue-100   text-blue-700   border-blue-300   dark:bg-blue-900/40   dark:text-blue-300   dark:border-blue-700'  },
  waiting_runner: { label: 'Wait runner',  color: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700' },
  waiting_parent: { label: 'Wait parent',  color: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700' },
  queued:         { label: 'Cola',         color: 'bg-gray-100   text-gray-600   border-gray-300   dark:bg-gray-800      dark:text-gray-400   dark:border-gray-600'  },
}
const ALL_STATUSES = Object.keys(STATUS_META)

function phaseNum(fase) {
  const m = fase?.match(/^f(\d+)/)
  return m ? parseInt(m[1]) : 99
}

export default function PipelinePanel({ executions, filterVariant, filterFase, filterPipeline, selectedId, onSelect, pipelineProjects = {} }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: queueStatus } = useQuery({
    queryKey: ['queue-status'],
    queryFn: getQueueStatus,
    refetchInterval: 5000,
  })
  const paused = queueStatus?.paused ?? false

  const pause = useMutation({
    mutationFn: pauseQueue,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue-status'] }),
  })
  const resume = useMutation({
    mutationFn: resumeQueue,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue-status'] }),
  })

  const cancel = useMutation({
    mutationFn: cancelExecution,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  // ── Bulk selection ────────────────────────────────────────────────────────
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [bulkCancelling, setBulkCancelling] = useState(false)

  // ── Status filter + sort (persisted) ─────────────────────────────────────
  const [visibleStatuses, setVisibleStatuses] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem('pipeline_panel_ui') ?? '{}'); return new Set(s.visibleStatuses ?? ALL_STATUSES) } catch { return new Set(ALL_STATUSES) }
  })
  const [phaseSort,  setPhaseSort]  = useState(() => { try { return JSON.parse(localStorage.getItem('pipeline_panel_ui') ?? '{}').phaseSort  ?? null } catch { return null } })
  const [statusSort, setStatusSort] = useState(() => { try { return JSON.parse(localStorage.getItem('pipeline_panel_ui') ?? '{}').statusSort ?? null } catch { return null } })

  useEffect(() => {
    localStorage.setItem('pipeline_panel_ui', JSON.stringify({ visibleStatuses: [...visibleStatuses], phaseSort, statusSort }))
  }, [visibleStatuses, phaseSort, statusSort])

  const toggleStatus = useCallback((status) => {
    setVisibleStatuses(prev => {
      const next = new Set(prev)
      next.has(status) ? next.delete(status) : next.add(status)
      return next.size === 0 ? new Set(ALL_STATUSES) : next
    })
  }, [])

  const cycleDir = (set) => set(prev => prev === null ? 'asc' : prev === 'asc' ? 'desc' : null)

  const items = executions
    .filter(e => ACTIVE_STATES.has(e.status))
    .filter(e => visibleStatuses.has(e.status))
    .filter(e => !filterVariant  || e.variant.includes(filterVariant))
    .filter(e => !filterFase     || e.fase === filterFase)
    .filter(e => !filterPipeline || e.pipeline_id === filterPipeline)
    .slice()
    .sort((a, b) => {
      // Status has priority when active
      if (statusSort) {
        const cmp = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)
        if (cmp !== 0) return statusSort === 'asc' ? cmp : -cmp
      }
      // Phase as tiebreaker (or sole sort)
      if (phaseSort) {
        const cmp = phaseNum(a.fase) - phaseNum(b.fase)
        if (cmp !== 0) return phaseSort === 'asc' ? cmp : -cmp
      }
      return 0
    })

  // Clear stale selections when items change
  useEffect(() => {
    setBulkSelected(prev => {
      const validIds = new Set(items.map(e => e.id))
      const next = new Set([...prev].filter(id => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items.map(e => e.id).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const allChecked  = items.length > 0 && items.every(e => bulkSelected.has(e.id))
  const someChecked = !allChecked && items.some(e => bulkSelected.has(e.id))

  const toggleAll = useCallback((e) => {
    e.stopPropagation()
    if (allChecked) setBulkSelected(new Set())
    else setBulkSelected(new Set(items.map(i => i.id)))
  }, [allChecked, items])

  const toggleOne = useCallback((e, id) => {
    e.stopPropagation()
    setBulkSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  async function handleBulkCancel() {
    if (bulkCancelling || bulkSelected.size === 0) return
    setBulkCancelling(true)
    await Promise.allSettled([...bulkSelected].map(id => cancelExecution(id)))
    setBulkSelected(new Set())
    setBulkCancelling(false)
    qc.invalidateQueries({ queryKey: ['executions'] })
  }

  const selected = executions.find(e => e.id === selectedId)

  const pauseBtn = (
    <div className="flex items-center gap-2 mb-2">
      {/* Select-all — only when list has items */}
      {items.length > 0 && (
        <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0" onClick={toggleAll}>
          <input
            type="checkbox"
            readOnly
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = someChecked }}
            className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {allChecked ? 'Deselec. todo' : 'Selec. todo'}
          </span>
        </label>
      )}

      {/* Paused indicator */}
      {paused && (
        <span className="flex items-center gap-1 text-amber-500 font-semibold text-xs shrink-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
          Cola pausada
        </span>
      )}

      <div className="flex items-center gap-2 ml-auto shrink-0">
        {/* Bulk cancel */}
        {bulkSelected.size > 0 && (
          <button
            onClick={handleBulkCancel}
            disabled={bulkCancelling}
            className="text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 rounded px-2 py-1 transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
          >
            {bulkCancelling && (
              <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            )}
            Cancelar {bulkSelected.size}
          </button>
        )}

        {/* Pause / resume */}
        <button
          onClick={() => paused ? resume.mutate() : pause.mutate()}
          className={`text-xs rounded px-2 py-1 transition-colors font-medium whitespace-nowrap ${
            paused
              ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 dark:text-amber-300'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300'
          }`}
        >
          {paused ? 'Reanudar cola' : 'Pausar cola'}
        </button>
      </div>
    </div>
  )

  const filterSortBar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1">
        {ALL_STATUSES.map(s => {
          const on = visibleStatuses.has(s)
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium transition-colors ${
                on ? STATUS_META[s].color : 'bg-transparent text-gray-400 border-gray-300 dark:border-gray-700 dark:text-gray-600 line-through'
              }`}
            >
              {STATUS_META[s].label}
            </button>
          )
        })}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        <span className="text-[10px] text-gray-400 dark:text-gray-600">Orden:</span>
        {[['Fase', phaseSort, () => cycleDir(setPhaseSort)], ['Estado', statusSort, () => cycleDir(setStatusSort)]].map(([label, dir, fn]) => (
          <button
            key={label}
            onClick={fn}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors flex items-center gap-0.5 ${
              dir
                ? 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700'
                : 'bg-transparent text-gray-500 border-gray-300 hover:border-gray-400 dark:text-gray-400 dark:border-gray-700'
            }`}
          >
            {label}
            {dir === 'asc' && ' ↑'}
            {dir === 'desc' && ' ↓'}
          </button>
        ))}
      </div>
    </div>
  )

  if (items.length === 0) {
    return (
      <div>
        {pauseBtn}
        {filterSortBar}
        <p className="text-xs text-gray-600 dark:text-gray-500 mt-2">Sin ejecuciones en curso</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {pauseBtn}
      {filterSortBar}
      {items.map(ex => (
        <div
          key={ex.id}
          onClick={() => onSelect(ex.id === selectedId ? null : ex.id)}
          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
            bulkSelected.has(ex.id)
              ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-600'
              : selectedId === ex.id
                ? 'border-indigo-600 bg-gray-200 dark:bg-gray-800'
                : 'border-gray-300 bg-white hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <input
                type="checkbox"
                checked={bulkSelected.has(ex.id)}
                onChange={e => toggleOne(e, ex.id)}
                onClick={e => e.stopPropagation()}
                className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
              />
              <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{ex.fase}</span>
              {ex.pipeline_id && (
                <PipelineChip project={pipelineProjects[ex.pipeline_id]} fallback={ex.pipeline_id} />
              )}
              {ex.runner && (
                <span className="shrink-0 bg-gray-200 border border-gray-300 text-gray-700 text-xs px-1.5 py-0.5 rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
                  {ex.runner}
                </span>
              )}
            </div>
            <StatusBadge status={ex.status} />
          </div>
          <div className="flex gap-3 text-xs text-gray-600 dark:text-gray-400">
            <span>variant: <span className="text-gray-900 dark:text-gray-200 font-mono">{ex.variant}</span></span>
            {ex.parent && <span>parent: <span className="text-gray-900 dark:text-gray-200 font-mono">{ex.parent}</span></span>}
          </div>
          <ParamsChips params={ex.params} />
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-500 mt-1">
            <span>{ex.created_at.slice(0, 19).replace('T', ' ')}</span>
            {ex.status === 'running' && ex.started_at && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <RunningTimer startIso={ex.started_at} />
              </span>
            )}
          </div>

          {selectedId === ex.id && (
            <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-700 flex flex-col gap-2">
              {ex.gh_run_id && (
                <a
                  href={`https://github.com/${pipelineProjects[ex.pipeline_id]?.repo ?? ''}/actions/runs/${ex.gh_run_id}`}
                  target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-indigo-500 hover:underline font-mono self-start"
                >
                  run #{ex.gh_run_id}
                </a>
              )}
              <div className="flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                {(() => {
                  const isCancelling = cancel.isPending && cancel.variables === ex.id
                  return (
                    <button
                      onClick={e => { e.stopPropagation(); cancel.mutate(ex.id) }}
                      disabled={isCancelling}
                      className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-2 py-1 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {isCancelling && (
                        <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                      )}
                      Cancelar
                    </button>
                  )
                })()}
                {ex.gh_run_id && (
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/vista3?run_id=${ex.gh_run_id}`) }}
                    className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-2 py-1 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
                  >
                    Logs →
                  </button>
                )}
              </div>
              {ex.runner === 'Local' && (
                <div onClick={e => e.stopPropagation()}>
                  <LocalLogViewer
                    executionId={ex.id}
                    active={ACTIVE_STATES.has(ex.status)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
