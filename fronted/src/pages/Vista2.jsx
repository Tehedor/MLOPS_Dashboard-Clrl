import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getExecutions, getPhases } from '../api/executions'
import { fetchRunsAsExecutions, subscribeRuns, isConfigured } from '../api/supabase'
import { transformPhases } from '../utils/phases'
import PhaseCard from '../features/vista2/PhaseCard'
import PipelinePanel from '../features/vista2/PipelinePanel'
import HistoryPanel from '../features/vista2/HistoryPanel'
import ResizeHandle from '../components/ui/ResizeHandle'
import { useSSE } from '../utils/useSSE'

const MIN_W           = 180   // ancho mínimo de un panel abierto
const COLLAPSE_AT     = 130   // si queda menos de esto, colapsar
const TOGGLE_W        = 28    // ancho de cada muesca
const HANDLE_W        = 4     // ancho del handle de resize

// ── Helpers de persistencia ───────────────────────────────────────────────────

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

  // Anchos iniciales: 50 / 25 de la pantalla, o lo guardado
  const [leftWidth, setLeftWidth] = useState(() =>
    loadNum('v2_leftWidth', Math.round(window.innerWidth * 0.5))
  )
  const [midWidth, setMidWidth] = useState(() =>
    loadNum('v2_midWidth', Math.round(window.innerWidth * 0.25))
  )
  const [midCollapsed,   setMidCollapsed]   = useState(() => loadBool('v2_midCollapsed'))
  const [rightCollapsed, setRightCollapsed] = useState(() => loadBool('v2_rightCollapsed'))

  // Persistir layout en localStorage
  useEffect(() => { localStorage.setItem('v2_leftWidth',      leftWidth)         }, [leftWidth])
  useEffect(() => { localStorage.setItem('v2_midWidth',       midWidth)          }, [midWidth])
  useEffect(() => { localStorage.setItem('v2_midCollapsed',   String(midCollapsed))   }, [midCollapsed])
  useEffect(() => { localStorage.setItem('v2_rightCollapsed', String(rightCollapsed)) }, [rightCollapsed])

  const [filterVariantL, setFilterVariantL] = useState('')
  const [filterFaseL,    setFilterFaseL]    = useState('')
  const [filterVariantR, setFilterVariantR] = useState('')
  const [filterFaseR,    setFilterFaseR]    = useState('')

  const { data: localExecutions = [], isLoading } = useQuery({
    queryKey: ['executions'],
    queryFn: getExecutions,
    refetchInterval: 10_000,
  })

  const { data: supabaseRuns = [] } = useQuery({
    queryKey: ['supabaseRuns'],
    queryFn: () => fetchRunsAsExecutions(100),
    enabled: isConfigured(),
    refetchInterval: 30_000,
  })

  // Suscripción Realtime: invalida la query cuando cambia workflow_runs
  useEffect(() => {
    if (!isConfigured()) return
    const channel = subscribeRuns(() => {
      qc.invalidateQueries({ queryKey: ['supabaseRuns'] })
    })
    return () => { channel.unsubscribe() }
  }, [qc])

  // Fusión: ejecuciones locales + runs de Supabase no presentes en local
  const executions = useMemo(() => {
    const supabaseById         = new Map(supabaseRuns.map(r => [r.id, r]))
    const supabaseByFaseVariant = new Map(
      supabaseRuns.filter(r => r.fase && r.variant).map(r => [`${r.fase}::${r.variant}`, r])
    )

    // Local entries que cubren un run de Supabase (por gh_run_id o por fase+variant)
    const localGhIds = new Set(
      localExecutions.filter(e => e.gh_run_id).map(e => String(e.gh_run_id))
    )
    const localFaseVariants = new Set(
      localExecutions.filter(e => !e.gh_run_id && e.variant).map(e => `${e.fase}::${e.variant}`)
    )

    // Supabase solo aporta runs que no están cubiertos por ningún local
    // Además deduplicamos por fase::variant (quedamos con el más reciente)
    const seenFaseVariant = new Set()
    const externalRuns = supabaseRuns
      .filter(r => !localGhIds.has(r.id) && !localFaseVariants.has(`${r.fase}::${r.variant}`))
      .filter(r => {
        const key = r.fase && r.variant ? `${r.fase}::${r.variant}` : r.id
        if (seenFaseVariant.has(key)) return false
        seenFaseVariant.add(key)
        return true
      })

    // Los locales siempre son visibles (tienen params), pero su status se actualiza desde Supabase.
    // Solo se sincroniza si la entrada de Supabase es de la misma ejecución (no de una anterior).
    const mergedLocal = localExecutions.map(e => {
      const sup = e.gh_run_id
        ? supabaseById.get(String(e.gh_run_id))
        : supabaseByFaseVariant.get(`${e.fase}::${e.variant}`)
      if (!sup || sup.status === e.status) return e
      // Si no hay gh_run_id (aún no tenemos el run de GHA), solo sincronizamos si
      // la entrada de Supabase es más reciente que la local (misma ejecución, no una anterior).
      if (!e.gh_run_id && new Date(sup.created_at) < new Date(e.created_at)) return e
      return { ...e, status: sup.status, updated_at: sup.updated_at }
    })

    return [...mergedLocal, ...externalRuns]
  }, [localExecutions, supabaseRuns])

  const _activeStatuses = new Set(['queued', 'waiting_parent', 'dispatching', 'running'])
  const _selectedEx = executions.find(e => e.id === selectedId)
  const highlightFaseVariant = _selectedEx && _activeStatuses.has(_selectedEx.status) && _selectedEx.variant
    ? `${_selectedEx.fase}::${_selectedEx.variant}`
    : null

  const { data: rawPhases = [] } = useQuery({
    queryKey: ['phases'],
    queryFn: getPhases,
    staleTime: Infinity,
    retry: 1,
  })

  const phases = transformPhases(rawPhases)

  useSSE('/api/executions/stream', () => {
    qc.invalidateQueries({ queryKey: ['executions'] })
  })

  // Estima el espacio que le queda al panel derecho dado leftW y midW actuales
  const estimateRight = useCallback((lw, mw, mCol) => {
    const midPart = mCol ? TOGGLE_W : (TOGGLE_W + HANDLE_W + mw)
    return window.innerWidth - lw - HANDLE_W - midPart - TOGGLE_W
  }, [])

  const resizeLeft = useCallback((delta) => {
    setLeftWidth(w => {
      const next = Math.max(MIN_W, w + delta)
      // Auto-colapsar derecha si queda demasiado estrecha
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
      // Auto-colapsar mid si queda muy estrecho
      if (next < COLLAPSE_AT) {
        setMidCollapsed(true)
        return MIN_W
      }
      // Auto-colapsar derecha si queda muy estrecha al expandir mid
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

      {/* ── Panel izquierdo — tarjetas de fase ── */}
      <aside
        className={`overflow-y-auto ${bothCollapsed ? 'flex-1' : 'shrink-0'}`}
        style={bothCollapsed
          ? { height: '100%' }
          : { width: leftWidth, height: '100%' }}
      >
        <div className="flex flex-col gap-5 p-4">
          {phases.map(phase => (
            <PhaseCard key={phase.id} phase={phase} executions={executions} />
          ))}
        </div>
      </aside>

      {/* Handle izq/mid — visible siempre que el izq no llene todo */}
      {!bothCollapsed && <ResizeHandle onResize={resizeLeft} />}

      {/* ── Muesca mid (siempre visible) + contenido ── */}
      <PanelToggle
        collapsed={midCollapsed}
        label="Pipeline"
        onToggle={() => setMidCollapsed(c => !c)}
      />
      {!midCollapsed && (
        <section className="flex flex-col overflow-hidden shrink-0" style={{ width: midWidth, height: '100%' }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-300 dark:border-gray-800 shrink-0">
            <FilterInput placeholder="Variante" value={filterVariantL} onChange={setFilterVariantL} />
            <FilterSelect value={filterFaseL} onChange={setFilterFaseL} phases={phases} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {isLoading ? (
              <p className="text-xs text-gray-500">Cargando...</p>
            ) : (
              <PipelinePanel
                executions={executions}
                filterVariant={filterVariantL}
                filterFase={filterFaseL}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>
        </section>
      )}

      {/* Handle mid/right — solo cuando ambos abiertos */}
      {!midCollapsed && !rightCollapsed && <ResizeHandle onResize={resizeMid} />}

      {/* Spacer: empuja la muesca derecha al borde cuando está colapsada */}
      {rightCollapsed && !bothCollapsed && <div className="flex-1" />}

      {/* ── Muesca right (siempre visible) + contenido ── */}
      <PanelToggle
        collapsed={rightCollapsed}
        label="Histórico"
        onToggle={() => setRightCollapsed(c => !c)}
      />
      {!rightCollapsed && (
        <section className="flex flex-col overflow-hidden flex-1" style={{ height: '100%' }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-300 dark:border-gray-800 shrink-0">
            <FilterInput placeholder="Variante" value={filterVariantR} onChange={setFilterVariantR} />
            <FilterSelect value={filterFaseR} onChange={setFilterFaseR} phases={phases} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {isLoading ? (
              <p className="text-xs text-gray-500">Cargando...</p>
            ) : (
              <HistoryPanel
                executions={executions}
                filterVariant={filterVariantR}
                filterFase={filterFaseR}
                selectedId={selectedId}
                onSelect={setSelectedId}
                highlightFaseVariant={highlightFaseVariant}
              />
            )}
          </div>
        </section>
      )}

    </div>
  )
}

// ── PanelToggle (muesca permanente) ──────────────────────────────────────────

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

// ── Filtros ───────────────────────────────────────────────────────────────────

function FilterInput({ placeholder, value, onChange }) {
  return (
    <input
      className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function FilterSelect({ value, onChange, phases = [] }) {
  return (
    <select
      className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">Todas las fases</option>
      {phases.map(p => (
        <option key={p.id} value={p.id}>{p.id}</option>
      ))}
    </select>
  )
}
