import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cancelExecution, retryExecution } from '../../api/executions'
import StatusBadge from './StatusBadge'

const ACTIVE_STATES  = new Set(['queued', 'waiting_parent', 'dispatching', 'running'])
const HISTORY_STATES = new Set(['success', 'failed', 'canceled'])

export default function QueuePanel({ executions, selectedId, onSelect }) {
  const qc = useQueryClient()

  const cancel = useMutation({
    mutationFn: cancelExecution,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })
  const retry = useMutation({
    mutationFn: retryExecution,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  const active  = executions?.filter(e => ACTIVE_STATES.has(e.status))  ?? []
  const history = executions?.filter(e => HISTORY_STATES.has(e.status)) ?? []
  const selected = executions?.find(e => e.id === selectedId)

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      <section>
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
          Cola activa ({active.length})
        </h3>
        {active.length === 0 ? (
          <p className="text-xs text-gray-600 dark:text-gray-500">Sin ejecuciones activas</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {active.map(ex => (
              <ExRow key={ex.id} ex={ex} selected={selectedId === ex.id} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">Detalle</h3>
          <dl className="flex flex-col gap-1.5 text-xs">
            <Row label="Fase"    value={selected.fase} />
            <Row label="Variant" value={selected.variant} />
            <Row label="Parent"  value={selected.parent ?? '—'} />
            <Row label="Runner"  value={selected.runner} />
            <Row label="Estado"  value={<StatusBadge status={selected.status} />} />
            {selected.error_code && (
              <Row label="Error" value={<span className="text-red-400">{selected.error_code}</span>} />
            )}
          </dl>
          <div className="flex gap-2 mt-3">
            {ACTIVE_STATES.has(selected.status) && selected.status !== 'queued' && (
              <button
                onClick={() => cancel.mutate(selected.id)}
                className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-2 py-1 transition-colors dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
            )}
            {(selected.status === 'failed' || selected.status === 'canceled') && (
              <button
                onClick={() => retry.mutate(selected.id)}
                className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded px-2 py-1 transition-colors dark:bg-indigo-900 dark:hover:bg-indigo-800 dark:text-indigo-300"
              >
                Reintentar
              </button>
            )}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Histórico reciente</h3>
        {history.length === 0 ? (
          <p className="text-xs text-gray-600 dark:text-gray-500">Sin histórico</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {history.slice(0, 20).map(ex => (
              <ExRow key={ex.id} ex={ex} selected={selectedId === ex.id} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ExRow({ ex, selected, onSelect }) {
  return (
    <li
      onClick={() => onSelect(ex.id)}
      className={`cursor-pointer rounded p-2 text-xs flex items-center justify-between gap-2 transition-colors ${
        selected ? 'bg-gray-200 dark:bg-gray-700' : 'bg-white hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800'
      }`}
    >
      <span className="text-gray-800 dark:text-gray-300 font-mono">
        {ex.fase} <span className="text-gray-500 dark:text-gray-500">{ex.variant}</span>
      </span>
      <StatusBadge status={ex.status} />
    </li>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <dt className="text-gray-500 dark:text-gray-500">{label}</dt>
      <dd className="text-gray-900 dark:text-gray-200">{value}</dd>
    </div>
  )
}
