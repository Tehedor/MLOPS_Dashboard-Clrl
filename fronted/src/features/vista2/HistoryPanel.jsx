import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { retryExecution, createExecution } from '../../api/executions'
import StatusBadge from './StatusBadge'
import ParamsChips from './ParamsChips'

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

const HISTORY_STATES = new Set(['success', 'failed', 'canceled'])

const STATUS_RANK = { success: 0, failed: 1, canceled: 2 }
const STATUS_META = {
  success:  { label: 'Success',  color: 'bg-green-100  text-green-700  border-green-300  dark:bg-green-900/40  dark:text-green-300  dark:border-green-700' },
  failed:   { label: 'Failed',   color: 'bg-red-100    text-red-700    border-red-300    dark:bg-red-900/40    dark:text-red-300    dark:border-red-700'   },
  canceled: { label: 'Canceled', color: 'bg-gray-100   text-gray-600   border-gray-300   dark:bg-gray-800      dark:text-gray-400   dark:border-gray-600'  },
}
const ALL_STATUSES = Object.keys(STATUS_META)

function phaseNum(fase) {
  const m = fase?.match(/^f(\d+)/)
  return m ? parseInt(m[1]) : 99
}

function cycleDir(set) { set(prev => prev === null ? 'desc' : prev === 'desc' ? 'asc' : null) }

function parseParams(raw) {
  try { return JSON.parse(raw ?? '{}') } catch { return {} }
}

export default function HistoryPanel({ executions, filterVariant, filterFase, filterPipeline, selectedId, onSelect, highlightFaseVariant, onLoadInCard, pipelineProjects = {} }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const retry = useMutation({
    mutationFn: retryExecution,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  const rerun = useMutation({
    mutationFn: (ex) => createExecution({
      pipeline_id: ex.pipeline_id,
      fase: ex.fase,
      variant: ex.variant,
      parent: ex.parent || null,
      params: parseParams(ex.params),
      selected_runner: ex.runner || null,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  // ── Status filter + sort (persisted) ─────────────────────────────────────
  const [visibleStatuses, setVisibleStatuses] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem('history_panel_ui') ?? '{}'); return new Set(s.visibleStatuses ?? ALL_STATUSES) } catch { return new Set(ALL_STATUSES) }
  })
  const [phaseSort,  setPhaseSort]  = useState(() => { try { return JSON.parse(localStorage.getItem('history_panel_ui') ?? '{}').phaseSort  ?? null  } catch { return null  } })
  const [statusSort, setStatusSort] = useState(() => { try { return JSON.parse(localStorage.getItem('history_panel_ui') ?? '{}').statusSort ?? null  } catch { return null  } })
  const [dateSort,   setDateSort]   = useState(() => { try { return JSON.parse(localStorage.getItem('history_panel_ui') ?? '{}').dateSort   ?? 'desc' } catch { return 'desc' } })

  useEffect(() => {
    localStorage.setItem('history_panel_ui', JSON.stringify({ visibleStatuses: [...visibleStatuses], phaseSort, statusSort, dateSort }))
  }, [visibleStatuses, phaseSort, statusSort, dateSort])

  const toggleStatus = useCallback((s) => {
    setVisibleStatuses(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next.size === 0 ? new Set(ALL_STATUSES) : next
    })
  }, [])

  const items = executions
    .filter(e => HISTORY_STATES.has(e.status))
    .filter(e => visibleStatuses.has(e.status))
    .filter(e => !filterVariant  || e.variant.includes(filterVariant))
    .filter(e => !filterFase     || e.fase === filterFase)
    .filter(e => !filterPipeline || e.pipeline_id === filterPipeline)
    .slice()
    .sort((a, b) => {
      // Status priority
      if (statusSort) {
        const cmp = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)
        if (cmp !== 0) return statusSort === 'asc' ? cmp : -cmp
      }
      // Phase
      if (phaseSort) {
        const cmp = phaseNum(a.fase) - phaseNum(b.fase)
        if (cmp !== 0) return phaseSort === 'asc' ? cmp : -cmp
      }
      // Date
      if (dateSort) {
        const cmp = new Date(a.updated_at) - new Date(b.updated_at)
        if (cmp !== 0) return dateSort === 'asc' ? cmp : -cmp
      }
      return 0
    })

  const filterSortBar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
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
        {[['Fase', phaseSort, () => cycleDir(setPhaseSort)], ['Estado', statusSort, () => cycleDir(setStatusSort)], ['Fecha', dateSort, () => cycleDir(setDateSort)]].map(([label, dir, fn]) => (
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
        {filterSortBar}
        <p className="text-xs text-gray-600 dark:text-gray-500">Sin histórico</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {filterSortBar}
      {items.map(ex => {
        const isHighlighted = !!highlightFaseVariant && `${ex.fase}::${ex.variant}` === highlightFaseVariant
        return (
        <div
          key={ex.id}
          onClick={() => onSelect(ex.id === selectedId ? null : ex.id)}
          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
            selectedId === ex.id
              ? 'border-indigo-600 bg-gray-200 dark:bg-gray-800'
              : isHighlighted
              ? 'border-green-400 bg-green-50 dark:border-green-500 dark:bg-green-950/20'
              : 'border-gray-300 bg-white hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1 min-w-0 gap-2">
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
          <div className="flex gap-3 text-xs text-gray-600 dark:text-gray-400 min-w-0 overflow-hidden">
            <span className="truncate">variant: <span className="text-gray-900 dark:text-gray-200 font-mono">{ex.variant}</span></span>
            {ex.parent && <span className="truncate shrink-0">parent: <span className="text-gray-900 dark:text-gray-200 font-mono">{ex.parent}</span></span>}
          </div>
          <ParamsChips params={ex.params} />
          <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-500 mt-1">
            <span>{ex.updated_at.slice(0, 19).replace('T', ' ')}</span>
          </div>
          {ex.error_code && (
            <div className="mt-1 text-xs text-red-400">{ex.error_code}</div>
          )}

          {selectedId === ex.id && (
            <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-700 flex flex-col gap-2">
              <div className="text-xs text-gray-500 dark:text-gray-500">
                {ex.created_at.slice(0, 19).replace('T', ' ')}
                <span className="mx-1">→</span>
                {ex.updated_at.slice(0, 19).replace('T', ' ')}
                {fmtDuration(ex.created_at, ex.updated_at) && (
                  <span className="ml-2 text-gray-400 dark:text-gray-600">
                    ({fmtDuration(ex.created_at, ex.updated_at)})
                  </span>
                )}
              </div>
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
              <div className="flex flex-wrap gap-2">
                {(ex.status === 'failed' || ex.status === 'canceled') && (
                  <button
                    onClick={e => { e.stopPropagation(); retry.mutate(ex.id) }}
                    className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded px-2 py-1 transition-colors dark:bg-indigo-900 dark:hover:bg-indigo-800 dark:text-indigo-300"
                  >
                    Reintentar
                  </button>
                )}
                {ex.status === 'success' && (
                  <button
                    onClick={e => { e.stopPropagation(); rerun.mutate(ex) }}
                    disabled={rerun.isPending}
                    className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded px-2 py-1 transition-colors disabled:opacity-50 dark:bg-indigo-900 dark:hover:bg-indigo-800 dark:text-indigo-300"
                  >
                    Re-run
                  </button>
                )}
                {onLoadInCard && (
                  <button
                    onClick={e => { e.stopPropagation(); onLoadInCard(ex) }}
                    className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-2 py-1 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
                  >
                    Cargar en tarjeta
                  </button>
                )}
                {ex.gh_run_id && (
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/vista3?run_id=${ex.gh_run_id}`) }}
                    className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-2 py-1 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
                  >
                    Logs →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        )
      })}
    </div>
  )
}
