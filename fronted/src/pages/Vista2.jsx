import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getExecutions, getPhases } from '../api/executions'
import { getPipelineProjects } from '../api/pipeline_projects'
import { fetchRunsAsExecutions, subscribeRuns, isConfigured } from '../api/supabase'
import { transformPhases } from '../utils/phases'
import { PHASE_PARAMS } from '../features/vista2/phaseParams'
import PhaseCard from '../features/vista2/PhaseCard'
import BatchPanel from '../features/vista2/BatchPanel'
import PipelinePanel from '../features/vista2/PipelinePanel'
import HistoryPanel from '../features/vista2/HistoryPanel'
import PipelineProjectSetup from '../features/vista2/PipelineProjectSetup'
import ResizeHandle from '../components/ui/ResizeHandle'
import PipelineSelect from '../components/PipelineSelect'
import { useSSE } from '../utils/useSSE'

const MIN_W       = 180
const COLLAPSE_AT = 130
const TOGGLE_W    = 28
const HANDLE_W    = 4

function loadNum(key, fallback) {
  const v = localStorage.getItem(key)
  return v !== null ? +v : fallback
}
function loadBool(key) {
  return localStorage.getItem(key) === 'true'
}

export default function Vista2() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const [leftWidth, setLeftWidth] = useState(() =>
    loadNum('v2_leftWidth', Math.round(window.innerWidth * 0.5))
  )
  const [midWidth, setMidWidth] = useState(() =>
    loadNum('v2_midWidth', Math.round(window.innerWidth * 0.25))
  )
  const [midCollapsed,   setMidCollapsed]   = useState(() => loadBool('v2_midCollapsed'))
  const [rightCollapsed, setRightCollapsed] = useState(() => loadBool('v2_rightCollapsed'))

  useEffect(() => { localStorage.setItem('v2_leftWidth',      leftWidth)               }, [leftWidth])
  useEffect(() => { localStorage.setItem('v2_midWidth',       midWidth)                }, [midWidth])
  useEffect(() => { localStorage.setItem('v2_midCollapsed',   String(midCollapsed))    }, [midCollapsed])
  useEffect(() => { localStorage.setItem('v2_rightCollapsed', String(rightCollapsed))  }, [rightCollapsed])

  // ── Pipeline-project selection (left panel tab) ───────────────────────────
  const [activePipelineId, setActivePipelineId] = useState(() =>
    localStorage.getItem('v2_activePipeline') ?? null
  )
  useEffect(() => {
    if (activePipelineId) localStorage.setItem('v2_activePipeline', activePipelineId)
  }, [activePipelineId])

  // ── Pipeline filter for mid/right panels ──────────────────────────────────
  const [filterPipelineMid,   setFilterPipelineMid]   = useState('')
  const [filterPipelineRight, setFilterPipelineRight] = useState('')

  // ── Existing filters ──────────────────────────────────────────────────────
  const [filterVariantL, setFilterVariantL] = useState('')
  const [filterFaseL,    setFilterFaseL]    = useState('')
  const [filterVariantR, setFilterVariantR] = useState('')
  const [filterFaseR,    setFilterFaseR]    = useState('')
  const [syncFilters,    setSyncFilters]    = useState(false)

  const [leftTab,      setLeftTab]      = useState('cards')
  const [leftWarnings, setLeftWarnings] = useState([])
  const [preloadMap,   setPreloadMap]   = useState({})

  const handleLoadInCard   = (ex) => setPreloadMap(prev => ({ ...prev, [ex.fase]: ex }))
  const handlePreloadConsumed = (phaseId) =>
    setPreloadMap(prev => { const next = { ...prev }; delete next[phaseId]; return next })

  const effectiveFilterVariantR = syncFilters ? filterVariantL : filterVariantR
  const effectiveFilterFaseR    = syncFilters ? filterFaseL    : filterFaseR

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: pipelineProjectsList = [] } = useQuery({
    queryKey: ['pipeline-projects'],
    queryFn:  getPipelineProjects,
    staleTime: Infinity,
  })

  // Map pipeline_id → project for quick lookup in child components
  const pipelineProjects = useMemo(
    () => Object.fromEntries(pipelineProjectsList.map(p => [p.id, p])),
    [pipelineProjectsList]
  )

  // Map branch → pipeline_id for Supabase run matching
  const branchMap = useMemo(
    () => Object.fromEntries(
      pipelineProjectsList.filter(p => p.branch).map(p => [p.branch, p.id])
    ),
    [pipelineProjectsList]
  )

  // Auto-select first pipeline if none saved
  useEffect(() => {
    if (!activePipelineId && pipelineProjectsList.length > 0) {
      setActivePipelineId(pipelineProjectsList[0].id)
    }
  }, [pipelineProjectsList, activePipelineId])

  const { data: localExecutions = [], isLoading } = useQuery({
    queryKey: ['executions'],
    queryFn:  () => getExecutions(),
    refetchInterval: 30_000,  // fallback poll — SSE handles real-time updates
  })

  const branchMapKey = pipelineProjectsList.map(p => `${p.id}:${p.branch}`).join(',')

  const { data: supabaseRuns = [] } = useQuery({
    queryKey: ['supabaseRuns', branchMapKey],
    queryFn: () => fetchRunsAsExecutions(100, branchMap),
    enabled: isConfigured() && pipelineProjectsList.length > 0,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!isConfigured()) return
    const channel = subscribeRuns(() => {
      qc.invalidateQueries({ queryKey: ['supabaseRuns'] })
    })
    return () => { channel.unsubscribe() }
  }, [qc])

  // Merge local + supabase runs
  const allExecutions = useMemo(() => {
    // Index Supabase runs by gh_run_id for unambiguous matching
    const supabaseById = new Map(supabaseRuns.map(r => [r.id, r]))

    // Local runs that already have a known gh_run_id
    const localGhIds = new Set(localExecutions.filter(e => e.gh_run_id).map(e => String(e.gh_run_id)))
    // ALL local variants (with or without gh_run_id) — prevents old Supabase runs from
    // reappearing once a local execution for the same fase::variant exists in any state.
    const localFaseVariants = new Set(localExecutions.filter(e => e.variant).map(e => `${e.fase}::${e.variant}`))

    // External Supabase runs: not matched by gh_run_id AND no local execution covers that fase::variant
    const seenFaseVariant = new Set()
    const externalRuns = supabaseRuns
      .filter(r => !localGhIds.has(r.id) && !localFaseVariants.has(`${r.fase}::${r.variant}`))
      .filter(r => {
        const key = r.fase && r.variant ? `${r.fase}::${r.variant}` : r.id
        if (seenFaseVariant.has(key)) return false
        seenFaseVariant.add(key)
        return true
      })

    // Merge: only update local status from Supabase when we have a definitive gh_run_id match.
    // Never override by fase::variant — that causes false matches with previous executions.
    const mergedLocal = localExecutions.map(e => {
      if (!e.gh_run_id) return e  // no gh_run_id yet — don't touch status
      const sup = supabaseById.get(String(e.gh_run_id))
      if (!sup || sup.status === e.status) return e
      return { ...e, status: sup.status, updated_at: sup.updated_at }
    })
    return [...mergedLocal, ...externalRuns]
  }, [localExecutions, supabaseRuns])

  // Executions scoped to the active pipeline (for PhaseCard duplicate checks)
  const pipelineExecutions = useMemo(
    () => activePipelineId
      ? allExecutions.filter(e => e.pipeline_id === activePipelineId)
      : allExecutions,
    [allExecutions, activePipelineId]
  )

  const _activeStatuses     = new Set(['queued', 'waiting_parent', 'dispatching', 'running'])
  const _selectedEx         = allExecutions.find(e => e.id === selectedId)
  const highlightFaseVariant = _selectedEx && _activeStatuses.has(_selectedEx.status) && _selectedEx.variant
    ? `${_selectedEx.fase}::${_selectedEx.variant}`
    : null

  const { data: rawPhases = [] } = useQuery({
    queryKey: ['phases'],
    queryFn:  getPhases,
    staleTime: Infinity,
    retry: 1,
  })
  const phases = transformPhases(rawPhases)

  useSSE('/api/executions/stream', (ex) => {
    qc.setQueryData(['executions'], (old = []) => {
      const idx = old.findIndex(e => e.id === ex.id)
      if (idx >= 0) {
        const next = [...old]
        next[idx] = ex
        return next
      }
      return [ex, ...old]
    })
  })

  // ── Layout helpers ────────────────────────────────────────────────────────

  const estimateRight = useCallback((lw, mw, mCol) => {
    const midPart = mCol ? TOGGLE_W : (TOGGLE_W + HANDLE_W + mw)
    return window.innerWidth - lw - HANDLE_W - midPart - TOGGLE_W
  }, [])

  const resizeLeft = useCallback((delta) => {
    setLeftWidth(w => {
      const next = Math.max(MIN_W, w + delta)
      setRightCollapsed(prev => {
        if (!prev && estimateRight(next, midWidth, midCollapsed) < COLLAPSE_AT) return true
        return prev
      })
      return next
    })
  }, [midWidth, midCollapsed, estimateRight])

  const resizeMid = useCallback((delta) => {
    setMidWidth(w => {
      const next = w + delta
      if (next < COLLAPSE_AT) { setMidCollapsed(true); return MIN_W }
      setRightCollapsed(prev => {
        if (!prev && estimateRight(leftWidth, next, false) < COLLAPSE_AT) return true
        return prev
      })
      return Math.max(MIN_W, next)
    })
  }, [leftWidth, estimateRight])

  const bothCollapsed = midCollapsed && rightCollapsed

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 3rem)' }}>

      {/* ── Panel izquierdo ── */}
      <aside
        className={`flex overflow-hidden ${bothCollapsed ? 'flex-1 flex-row' : 'flex-col shrink-0'}`}
        style={bothCollapsed ? { height: '100%' } : { width: leftWidth, height: '100%' }}
      >
        <div
          className="flex flex-col overflow-hidden"
          style={bothCollapsed ? { width: '55%' } : { flex: 1 }}
        >
          {/* Pipeline-project tabs */}
          <div className="flex overflow-x-auto shrink-0 border-b border-gray-300 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
            {pipelineProjectsList.map(p => (
              <PipelineTab
                key={p.id}
                label={p.label}
                color={p.color}
                active={activePipelineId === p.id}
                onClick={() => setActivePipelineId(p.id)}
              />
            ))}
            {pipelineProjectsList.length === 0 && (
              <span className="px-3 py-1.5 text-xs text-gray-400 italic">Cargando proyectos…</span>
            )}
          </div>

          {/* Branch status + setup lifecycle */}
          <PipelineProjectSetup
            pipelineId={activePipelineId}
            pipeline={activePipelineId ? (pipelineProjects[activePipelineId] ?? null) : null}
          />

          {/* Por fase / Batch sub-tabs */}
          <div className="flex px-2 pt-1 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <LeftTabBtn label="Por fase" active={leftTab === 'cards'} onClick={() => setLeftTab('cards')} color={pipelineProjects[activePipelineId]?.color} />
            <LeftTabBtn label="Batch"    active={leftTab === 'batch'} onClick={() => setLeftTab('batch')} color={pipelineProjects[activePipelineId]?.color} />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {leftTab === 'cards' ? (
              <div className="flex flex-col gap-5 p-4">
                {phases.map(phase => (
                  <PhaseCard
                    key={phase.id}
                    phase={phase}
                    executions={pipelineExecutions}
                    preload={preloadMap[phase.id] ?? null}
                    onPreloadConsumed={() => handlePreloadConsumed(phase.id)}
                    pipelineId={activePipelineId}
                    color={pipelineProjects[activePipelineId]?.color}
                  />
                ))}
              </div>
            ) : (
              <BatchPanel phases={phases} executions={pipelineExecutions} onWarnings={setLeftWarnings} pipelineId={activePipelineId} color={pipelineProjects[activePipelineId]?.color} />
            )}
          </div>
        </div>

        {/* Sub-panel de avisos (solo cuando ambos paneles derechos colapsados) */}
        {bothCollapsed && (
          <div className="flex-1 overflow-y-auto border-l border-gray-200 dark:border-gray-800">
            {leftTab === 'batch' ? (
              leftWarnings.length > 0 ? (
                <div className="p-3 flex flex-col gap-1">
                  <p className="text-[10px] font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-2">
                    Obligatorios vacíos
                  </p>
                  {leftWarnings.map((w, i) => (
                    <div key={i} className="text-xs text-yellow-500 dark:text-yellow-400 font-mono">{w}</div>
                  ))}
                </div>
              ) : (
                <div className="p-3">
                  <p className="text-xs text-green-500 dark:text-green-400">✓ Sin avisos</p>
                </div>
              )
            ) : (
              <div className="p-3 flex flex-col gap-4">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Params obligatorios
                </p>
                {phases.map(phase => {
                  const required = (PHASE_PARAMS[phase.id] ?? []).filter(d => d.required)
                  if (!required.length) return null
                  return (
                    <div key={phase.id}>
                      <p className="text-xs font-mono text-indigo-500 dark:text-indigo-400 mb-1">#{phase.id}</p>
                      <div className="flex flex-col gap-0.5">
                        {required.map(d => (
                          <span key={d.id} className="text-xs text-gray-500 dark:text-gray-400 font-mono pl-2">
                            {d.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </aside>

      {!bothCollapsed && <ResizeHandle onResize={resizeLeft} />}

      {/* ── Muesca mid ── */}
      <PanelToggle
        collapsed={midCollapsed}
        label="Pipeline"
        onToggle={() => setMidCollapsed(c => !c)}
      />
      {!midCollapsed && (
        <section
          className={`flex flex-col overflow-hidden ${rightCollapsed ? 'flex-1 min-w-0' : 'shrink-0'}`}
          style={rightCollapsed ? { height: '100%' } : { width: midWidth, height: '100%' }}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-300 dark:border-gray-800 shrink-0 flex-wrap">
            <FilterInput placeholder="Variante" value={filterVariantL} onChange={setFilterVariantL} />
            <FilterSelect value={filterFaseL} onChange={setFilterFaseL} phases={phases} />
            <PipelineFilterSelect
              value={filterPipelineMid}
              onChange={setFilterPipelineMid}
              projects={pipelineProjectsList}
            />
            <label className="flex items-center gap-1 shrink-0 cursor-pointer select-none" title="Sincronizar filtros con Histórico">
              <input
                type="checkbox"
                checked={syncFilters}
                onChange={e => setSyncFilters(e.target.checked)}
                className="accent-indigo-500"
              />
              <span className="text-xs text-gray-500 dark:text-gray-500">Sync</span>
            </label>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {isLoading ? (
              <p className="text-xs text-gray-500">Cargando...</p>
            ) : (
              <PipelinePanel
                executions={allExecutions}
                filterVariant={filterVariantL}
                filterFase={filterFaseL}
                filterPipeline={filterPipelineMid}
                selectedId={selectedId}
                onSelect={setSelectedId}
                pipelineProjects={pipelineProjects}
              />
            )}
          </div>
        </section>
      )}

      {!midCollapsed && !rightCollapsed && <ResizeHandle onResize={resizeMid} />}

      {/* ── Muesca right ── */}
      <PanelToggle
        collapsed={rightCollapsed}
        label="Histórico"
        onToggle={() => setRightCollapsed(c => !c)}
      />
      {!rightCollapsed && (
        <section className="flex flex-col overflow-hidden flex-1 min-w-0" style={{ height: '100%' }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-300 dark:border-gray-800 shrink-0 flex-wrap">
            <FilterInput
              placeholder="Variante"
              value={syncFilters ? filterVariantL : filterVariantR}
              onChange={v => { if (!syncFilters) setFilterVariantR(v) }}
              disabled={syncFilters}
            />
            <FilterSelect
              value={syncFilters ? filterFaseL : filterFaseR}
              onChange={v => { if (!syncFilters) setFilterFaseR(v) }}
              phases={phases}
              disabled={syncFilters}
            />
            <PipelineFilterSelect
              value={syncFilters ? filterPipelineMid : filterPipelineRight}
              onChange={v => { if (!syncFilters) setFilterPipelineRight(v) }}
              projects={pipelineProjectsList}
              disabled={syncFilters}
            />
            {syncFilters && (
              <span className="text-xs text-indigo-500 dark:text-indigo-400 shrink-0">↔ sync</span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {isLoading ? (
              <p className="text-xs text-gray-500">Cargando...</p>
            ) : (
              <HistoryPanel
                executions={allExecutions}
                filterVariant={effectiveFilterVariantR}
                filterFase={effectiveFilterFaseR}
                filterPipeline={syncFilters ? filterPipelineMid : filterPipelineRight}
                selectedId={selectedId}
                onSelect={setSelectedId}
                highlightFaseVariant={highlightFaseVariant}
                onLoadInCard={handleLoadInCard}
                pipelineProjects={pipelineProjects}
              />
            )}
          </div>
        </section>
      )}

    </div>
  )
}

// ── PipelineTab ───────────────────────────────────────────────────────────────

function PipelineTab({ label, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
        active
          ? 'bg-white dark:bg-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800'
      }`}
      style={active && color ? { borderColor: color, color } : undefined}
    >
      {color && (
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color, opacity: active ? 1 : 0.5 }}
        />
      )}
      {label}
    </button>
  )
}

// ── PanelToggle ───────────────────────────────────────────────────────────────

function PanelToggle({ collapsed, label, onToggle }) {
  return (
    <div
      onClick={onToggle}
      title={collapsed ? `Expandir ${label}` : `Colapsar ${label}`}
      className="shrink-0 flex flex-col items-center justify-start pt-5 gap-4
                 cursor-pointer select-none
                 border-l border-gray-200 dark:border-gray-800
                 bg-gray-50 dark:bg-gray-900/50
                 hover:bg-indigo-50 dark:hover:bg-indigo-950/30
                 transition-colors"
      style={{ width: TOGGLE_W }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
        className="w-3 h-3 text-gray-400 dark:text-gray-600 shrink-0 transition-transform"
        style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
      >
        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
      </svg>
      <span
        className="text-[10px] font-medium text-gray-400 dark:text-gray-600 tracking-widest"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {label}
      </span>
    </div>
  )
}

// ── LeftTabBtn ────────────────────────────────────────────────────────────────

function LeftTabBtn({ label, active, onClick, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-current'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300'
      }`}
      style={active ? { color, borderColor: color } : undefined}
    >
      {label}
    </button>
  )
}

// ── Filters ───────────────────────────────────────────────────────────────────

function FilterInput({ placeholder, value, onChange, disabled = false }) {
  return (
    <input
      className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    />
  )
}

function FilterSelect({ value, onChange, phases = [], disabled = false }) {
  return (
    <select
      className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">Todas las fases</option>
      {phases.map(p => (
        <option key={p.id} value={p.id}>{p.id}</option>
      ))}
    </select>
  )
}

const PipelineFilterSelect = (props) => <PipelineSelect {...props} showAll={true} />
