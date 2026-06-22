import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { getLineageRegistry, syncLineageRegistry, getLineageConfig } from '../api/lineage'
import { getPipelineProjects } from '../api/pipeline_projects'
import { getSyncInterval } from '../api/variants'
import { useSSE } from '../utils/useSSE'
import PipelineSelect from '../components/PipelineSelect'
import LineageGraph from '../features/lineage/LineageGraph'
import '../features/lineage/LineageGraph.css'

// ── View mode definitions ─────────────────────────────────────────────────────

const VIEW_MODES = [
  {
    id: 'compact',
    label: 'Compacto',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <rect x="1" y="2" width="4" height="3" rx="0.5" fill="currentColor" opacity=".9"/>
        <rect x="1" y="7" width="4" height="3" rx="0.5" fill="currentColor" opacity=".9"/>
        <rect x="6" y="4" width="4" height="3" rx="0.5" fill="currentColor" opacity=".9"/>
        <rect x="11" y="2" width="4" height="3" rx="0.5" fill="currentColor" opacity=".9"/>
        <rect x="11" y="7" width="4" height="3" rx="0.5" fill="currentColor" opacity=".9"/>
        <line x1="5" y1="3.5" x2="6" y2="5.5" stroke="currentColor" strokeWidth="1" opacity=".5"/>
        <line x1="5" y1="8.5" x2="6" y2="5.5" stroke="currentColor" strokeWidth="1" opacity=".5"/>
        <line x1="10" y1="5.5" x2="11" y2="3.5" stroke="currentColor" strokeWidth="1" opacity=".5"/>
        <line x1="10" y1="5.5" x2="11" y2="8.5" stroke="currentColor" strokeWidth="1" opacity=".5"/>
      </svg>
    ),
  },
  {
    id: 'classic',
    label: 'Clásico',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <rect x="1" y="1" width="4" height="14" rx="1" fill="currentColor" opacity=".25"/>
        <rect x="1.5" y="2" width="3" height="3" rx="0.5" fill="currentColor" opacity=".9"/>
        <rect x="1.5" y="6.5" width="3" height="2.5" rx="0.5" fill="currentColor" opacity=".7"/>
        <rect x="1.5" y="10.5" width="3" height="2.5" rx="0.5" fill="currentColor" opacity=".5"/>
        <rect x="6" y="1" width="4" height="14" rx="1" fill="currentColor" opacity=".25"/>
        <rect x="6.5" y="4" width="3" height="3" rx="0.5" fill="currentColor" opacity=".9"/>
        <rect x="6.5" y="8.5" width="3" height="2.5" rx="0.5" fill="currentColor" opacity=".7"/>
        <rect x="11" y="1" width="4" height="14" rx="1" fill="currentColor" opacity=".25"/>
        <rect x="11.5" y="3" width="3" height="2.5" rx="0.5" fill="currentColor" opacity=".9"/>
        <rect x="11.5" y="7" width="3" height="3" rx="0.5" fill="currentColor" opacity=".7"/>
      </svg>
    ),
  },
  {
    id: 'detail',
    label: 'Detalle',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
        <rect x="1" y="2" width="14" height="3" rx="0.5" fill="currentColor" opacity=".9"/>
        <rect x="1" y="7" width="14" height="2" rx="0.5" fill="currentColor" opacity=".6"/>
        <rect x="1" y="11" width="10" height="2" rx="0.5" fill="currentColor" opacity=".4"/>
      </svg>
    ),
  },
]

function DateRangePopup({ dateStart, dateEnd, onChange, onClear }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const isActive = dateStart || dateEnd
  const label = isActive
    ? `${dateStart ?? '…'} → ${dateEnd ?? '…'}`
    : null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Filtrar por fecha de creación"
        className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors
          ${isActive
            ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500 dark:text-indigo-300'
            : 'border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
      >
        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0">
          <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M2 7h12" stroke="currentColor" strokeWidth="1.3"/>
          <rect x="4.5" y="9" width="2" height="2" rx="0.3" fill="currentColor" opacity=".7"/>
          <rect x="9.5" y="9" width="2" height="2" rx="0.3" fill="currentColor" opacity=".7"/>
        </svg>
        {label && <span className="font-mono whitespace-nowrap">{label}</span>}
        {isActive && (
          <span
            onClick={e => { e.stopPropagation(); onClear(); setOpen(false) }}
            className="ml-0.5 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
          >✕</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 flex flex-col gap-3 min-w-[220px]">
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Rango de creación
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Desde</span>
            <input
              type="date"
              value={dateStart ?? ''}
              onChange={e => onChange({ start: e.target.value || null, end: dateEnd })}
              className="text-xs rounded border border-gray-300 dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Hasta</span>
            <input
              type="date"
              value={dateEnd ?? ''}
              min={dateStart ?? undefined}
              onChange={e => onChange({ start: dateStart, end: e.target.value || null })}
              className="text-xs rounded border border-gray-300 dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-400"
            />
          </label>
          {isActive && (
            <button
              onClick={() => { onClear(); setOpen(false) }}
              className="text-xs text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors self-start"
            >
              Limpiar fechas
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

export default function Linaje() {
  const qc = useQueryClient()

  // ── Pipeline selector ─────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery({
    queryKey: ['pipeline-projects'],
    queryFn: getPipelineProjects,
    staleTime: Infinity,
  })

  const [pipelineId, setPipelineId] = useState(() => localStorage.getItem('linaje_pipeline') ?? null)
  useEffect(() => { if (!pipelineId && projects.length > 0) setPipelineId(projects[0].id) }, [projects, pipelineId])
  useEffect(() => { if (pipelineId) localStorage.setItem('linaje_pipeline', pipelineId) }, [pipelineId])

  // ── View mode ─────────────────────────────────────────────────────────────
  const [viewModeIdx, setViewModeIdx] = useState(() => Number(localStorage.getItem('linaje_viewMode') ?? 0))
  const [filterText,  setFilterText]  = useState(() => localStorage.getItem('linaje_filterText') ?? '')
  const [dateStart,   setDateStart]   = useState(() => localStorage.getItem('linaje_dateStart') || null)
  const [dateEnd,     setDateEnd]     = useState(() => localStorage.getItem('linaje_dateEnd')   || null)

  useEffect(() => { localStorage.setItem('linaje_viewMode',   String(viewModeIdx)) }, [viewModeIdx])
  useEffect(() => { localStorage.setItem('linaje_filterText', filterText) },          [filterText])
  useEffect(() => { localStorage.setItem('linaje_dateStart',  dateStart ?? '') },     [dateStart])
  useEffect(() => { localStorage.setItem('linaje_dateEnd',    dateEnd   ?? '') },     [dateEnd])
  const viewMode = VIEW_MODES[viewModeIdx]
  const cycleView = () => setViewModeIdx(i => (i + 1) % VIEW_MODES.length)

  // ── Sync interval (from backend config) ──────────────────────────────────
  const { data: intervals = {} } = useQuery({
    queryKey: ['sync-interval'],
    queryFn: getSyncInterval,
    staleTime: Infinity,
  })
  const repoSyncMs = (intervals.repo_sync_seconds ?? 60) * 1000

  // ── Lineage config ────────────────────────────────────────────────────────
  const { data: allConfigs = {} } = useQuery({
    queryKey: ['lineage-config'],
    queryFn: getLineageConfig,
    staleTime: Infinity,
  })
  const phasesConfig = pipelineId ? (allConfigs[pipelineId]?.phases ?? []) : []

  // ── Registry ──────────────────────────────────────────────────────────────
  const { data: registry, isFetching: registryFetching } = useQuery({
    queryKey: ['lineage-registry', pipelineId],
    queryFn: () => getLineageRegistry(pipelineId),
    enabled: !!pipelineId,
    staleTime: repoSyncMs,
    refetchInterval: repoSyncMs,
  })

  // ── Invalidar al terminar ejecuciones (SSE) ───────────────────────────────
  useSSE('/api/executions/stream', (ex) => {
    if (ex.status === 'success' || ex.status === 'failed') {
      if (!pipelineId || ex.pipeline_id === pipelineId) {
        qc.invalidateQueries({ queryKey: ['lineage-registry', pipelineId] })
      }
    }
  })

  // ── Sync ──────────────────────────────────────────────────────────────────
  const { mutate: doSync, isPending: syncing } = useMutation({
    mutationFn: () => syncLineageRegistry(pipelineId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lineage-registry', pipelineId] }),
  })

  const isWorking = syncing || registryFetching
  const total    = registry?.variants?.length ?? 0
  const syncedAt = registry?.synced_at ? new Date(registry.synced_at).toLocaleString() : null

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-300 dark:border-gray-800">
        <span className="font-semibold text-sm text-gray-900 dark:text-white">Pipeline Lineage</span>

        {projects.length > 1 && (
          <div className="w-48">
            <PipelineSelect value={pipelineId ?? ''} onChange={setPipelineId} projects={projects} showAll={false} />
          </div>
        )}

        {total > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
            {total} variante{total !== 1 ? 's' : ''}
            {syncedAt && <> · {syncedAt}</>}
          </span>
        )}

        {/* Date range filter */}
        {total > 0 && (
          <DateRangePopup
            dateStart={dateStart}
            dateEnd={dateEnd}
            onChange={({ start, end }) => { setDateStart(start); setDateEnd(end) }}
            onClear={() => { setDateStart(null); setDateEnd(null) }}
          />
        )}

        {/* Text filter input */}
        {total > 0 && (
          <div className="relative flex items-center">
            <svg className="absolute left-2 w-3 h-3 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
            </svg>
            <input
              type="text"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="filtrar variantes…"
              className="pl-6 pr-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500 w-36"
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="absolute right-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >✕</button>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isWorking && <Spinner />}

          {/* View mode cycling button */}
          <button
            onClick={cycleView}
            title={`Vista: ${viewMode.label} — click para cambiar`}
            className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {viewMode.icon}
          </button>

          <button
            onClick={() => doSync()}
            disabled={syncing || !pipelineId}
            className="px-3 py-1 text-xs font-medium rounded border transition-colors
              border-gray-300 text-gray-700 hover:bg-gray-200 disabled:opacity-50
              dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {syncing ? 'Sincronizando…' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!pipelineId ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
            Selecciona un pipeline-project
          </div>
        ) : !registry || total === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400 gap-2">
            {isWorking && <Spinner />}
            <span>{syncing ? 'Escaneando variantes…' : 'Sin datos — pulsa Sync para escanear'}</span>
          </div>
        ) : (
          <LineageGraph registry={registry} phasesConfig={phasesConfig} mode={viewMode.id} filterText={filterText} dateStart={dateStart} dateEnd={dateEnd} pipelineId={pipelineId} pipelineRepo={projects.find(p => p.id === pipelineId)?.repo} />
        )}
      </div>
    </div>
  )
}
