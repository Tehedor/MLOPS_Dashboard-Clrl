import { useEffect, useRef, useState } from 'react'
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

const ACTIVE_STATES = new Set(['queued', 'waiting_parent', 'waiting_runner', 'dispatching', 'running'])

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

  const items = executions
    .filter(e => ACTIVE_STATES.has(e.status))
    .filter(e => !filterVariant  || e.variant.includes(filterVariant))
    .filter(e => !filterFase     || e.fase === filterFase)
    .filter(e => !filterPipeline || e.pipeline_id === filterPipeline)

  const selected = executions.find(e => e.id === selectedId)

  const pauseBtn = (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {paused && (
          <span className="flex items-center gap-1 text-amber-500 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            Cola pausada
          </span>
        )}
      </span>
      <button
        onClick={() => paused ? resume.mutate() : pause.mutate()}
        className={`text-xs rounded px-2 py-1 transition-colors font-medium ${
          paused
            ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 dark:text-amber-300'
            : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300'
        }`}
      >
        {paused ? 'Reanudar cola' : 'Pausar cola'}
      </button>
    </div>
  )

  if (items.length === 0) {
    return (
      <div>
        {pauseBtn}
        <p className="text-xs text-gray-600 dark:text-gray-500 mt-2">Sin ejecuciones en curso</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {pauseBtn}
      {items.map(ex => (
        <div
          key={ex.id}
          onClick={() => onSelect(ex.id === selectedId ? null : ex.id)}
          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
            selectedId === ex.id
              ? 'border-indigo-600 bg-gray-200 dark:bg-gray-800'
              : 'border-gray-300 bg-white hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
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
          <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-500 mt-1">
            <span>{ex.created_at.slice(0, 19).replace('T', ' ')}</span>
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
