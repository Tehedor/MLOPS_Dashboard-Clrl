import { useMutation, useQueryClient } from '@tanstack/react-query'
import { retryExecution } from '../../api/executions'
import StatusBadge from './StatusBadge'

const HISTORY_STATES = new Set(['success', 'failed', 'canceled'])

export default function HistoryPanel({ executions, filterVariant, filterFase, selectedId, onSelect }) {
  const qc = useQueryClient()

  const retry = useMutation({
    mutationFn: retryExecution,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  const items = executions
    .filter(e => HISTORY_STATES.has(e.status))
    .filter(e => !filterVariant || e.variant.includes(filterVariant))
    .filter(e => !filterFase    || e.fase === filterFase)

  if (items.length === 0) {
    return <p className="text-xs text-gray-600 mt-2">Sin histórico</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map(ex => (
        <div
          key={ex.id}
          onClick={() => onSelect(ex.id === selectedId ? null : ex.id)}
          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
            selectedId === ex.id
              ? 'border-indigo-600 bg-gray-800'
              : 'border-gray-700 bg-gray-900 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-white">{ex.fase}</span>
            <StatusBadge status={ex.status} />
          </div>
          <div className="flex gap-3 text-xs text-gray-400">
            <span>variant: <span className="text-gray-200 font-mono">{ex.variant}</span></span>
            {ex.parent && <span>parent: <span className="text-gray-200 font-mono">{ex.parent}</span></span>}
          </div>
          <div className="flex gap-3 text-xs text-gray-500 mt-1">
            <span>{ex.runner}</span>
            <span>{ex.updated_at.slice(0, 19).replace('T', ' ')}</span>
          </div>
          {ex.error_code && (
            <div className="mt-1 text-xs text-red-400">{ex.error_code}</div>
          )}

          {/* Acciones inline si está seleccionado */}
          {selectedId === ex.id && (ex.status === 'failed' || ex.status === 'canceled') && (
            <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700">
              <button
                onClick={e => { e.stopPropagation(); retry.mutate(ex.id) }}
                className="text-xs bg-indigo-900 hover:bg-indigo-800 text-indigo-300 rounded px-2 py-1 transition-colors"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
