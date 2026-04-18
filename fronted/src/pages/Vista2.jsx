import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getExecutions } from '../api/executions'
import PhaseCard, { PHASES } from '../features/vista2/PhaseCard'
import PipelinePanel from '../features/vista2/PipelinePanel'
import HistoryPanel from '../features/vista2/HistoryPanel'
import ResizeHandle from '../components/ui/ResizeHandle'
import { useSSE } from '../utils/useSSE'

const MIN_WIDTH = 200
const MAX_LEFT  = 480

export default function Vista2() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  // Anchos redimensionables
  const [leftWidth, setLeftWidth] = useState(288)
  const [midWidth,  setMidWidth]  = useState(320)

  // Filtros panel central
  const [filterVariantL, setFilterVariantL] = useState('')
  const [filterFaseL,    setFilterFaseL]    = useState('')

  // Filtros panel derecho
  const [filterVariantR, setFilterVariantR] = useState('')
  const [filterFaseR,    setFilterFaseR]    = useState('')

  const { data: executions = [], isLoading } = useQuery({
    queryKey: ['executions'],
    queryFn: getExecutions,
    refetchInterval: 10_000,
  })

  useSSE('/api/executions/stream', () => {
    qc.invalidateQueries({ queryKey: ['executions'] })
  })

  const resizeLeft = useCallback((delta) => {
    setLeftWidth(w => Math.max(MIN_WIDTH, Math.min(MAX_LEFT, w + delta)))
  }, [])

  const resizeMid = useCallback((delta) => {
    setMidWidth(w => Math.max(MIN_WIDTH, w + delta))
  }, [])

  return (
    <div className="flex h-full overflow-hidden">

      {/* [1-4] Panel izquierdo — tarjetas de fase */}
      <aside
        className="shrink-0 overflow-y-auto p-4 flex flex-col gap-5"
        style={{ width: leftWidth }}
      >
        {PHASES.map(phase => (
          <PhaseCard key={phase.id} phase={phase} executions={executions} />
        ))}
      </aside>

      <ResizeHandle onResize={resizeLeft} />

      {/* [5-7] Panel central — pipeline activo */}
      <section
        className="flex flex-col overflow-hidden shrink-0"
        style={{ width: midWidth }}
      >
        <div className="flex gap-2 p-3 border-b border-gray-800 shrink-0">
          <FilterInput placeholder="Variante" value={filterVariantL} onChange={setFilterVariantL} />
          <FilterSelect value={filterFaseL} onChange={setFilterFaseL} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
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

      <ResizeHandle onResize={resizeMid} />

      {/* [8-10] Panel derecho — histórico */}
      <section className="flex flex-col overflow-hidden flex-1 min-w-0">
        <div className="flex gap-2 p-3 border-b border-gray-800 shrink-0">
          <FilterInput placeholder="Variante" value={filterVariantR} onChange={setFilterVariantR} />
          <FilterSelect value={filterFaseR} onChange={setFilterFaseR} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <p className="text-xs text-gray-500">Cargando...</p>
          ) : (
            <HistoryPanel
              executions={executions}
              filterVariant={filterVariantR}
              filterFase={filterFaseR}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </section>

    </div>
  )
}

function FilterInput({ placeholder, value, onChange }) {
  return (
    <input
      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function FilterSelect({ value, onChange }) {
  return (
    <select
      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-indigo-500"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">Todas las fases</option>
      {['f01_explore','f02_events','f03_windows','f04_targets',
        'f05_modeling','f06_quant','f07_modval','f08_sysval'].map(f => (
        <option key={f} value={f}>{f}</option>
      ))}
    </select>
  )
}
