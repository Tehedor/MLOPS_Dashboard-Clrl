import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cancelExecution, retryExecution } from '../../api/executions'
import StatusBadge from './StatusBadge'
import ParamsChips from './ParamsChips'

const ACTIVE_STATES = new Set(['queued', 'waiting_parent', 'dispatching', 'running'])

export default function PipelinePanel({ executions, filterVariant, filterFase, selectedId, onSelect }) {
  const qc = useQueryClient()

  const cancel = useMutation({
    mutationFn: cancelExecution,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  const items = executions
    .filter(e => ACTIVE_STATES.has(e.status))
    .filter(e => !filterVariant || e.variant.includes(filterVariant))
    .filter(e => !filterFase    || e.fase === filterFase)

  const selected = executions.find(e => e.id === selectedId)

  if (items.length === 0) {
    return <p className="text-xs text-gray-600 dark:text-gray-500 mt-2">Sin ejecuciones en curso</p>
  }

  return (
    <div className="flex flex-col gap-2">
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
            <div className="flex items-center gap-8 min-w-0">
              <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{ex.fase}</span>
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

          {/* Acciones inline si está seleccionado */}
          {selectedId === ex.id && (
            <div className="flex gap-2 mt-2 pt-2 border-t border-gray-300 dark:border-gray-700">
              {ex.status !== 'queued' && (
                <button
                  onClick={e => { e.stopPropagation(); cancel.mutate(ex.id) }}
                  className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-2 py-1 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
