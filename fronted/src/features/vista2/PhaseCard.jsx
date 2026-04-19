import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createExecution } from '../../api/executions'
import StatusBadge from './StatusBadge'
import ParamsEditor from './ParamsEditor'

export default function PhaseCard({ phase, executions }) {
  const qc = useQueryClient()
  const [variant, setVariant] = useState('')
  const [parent,  setParent]  = useState('')
  const paramsRef = useRef({})

  const latestEx = executions?.filter(e => e.fase === phase.id)[0]

  const { mutate, isPending } = useMutation({
    mutationFn: createExecution,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (paramsRef.current === null) return   // JSON inválido — ParamsEditor ya muestra el error
    mutate({ fase: phase.id, variant, parent: parent || null, params: paramsRef.current })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900"
    >
      {/* [1] Título superpuesto sobre el borde superior */}
      <div className="absolute -top-px left-0 right-0 flex items-center gap-1.5 px-3">
        <span className="bg-indigo-600 text-white text-xs font-semibold px-2 py-0.5 rounded-b">
          {phase.label}
        </span>
        <span className="bg-gray-200 border border-gray-300 text-gray-700 text-xs px-2 py-0.5 rounded-b dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
          {phase.runner}
        </span>
        {latestEx && (
          <span className="ml-auto bg-white pr-1 dark:bg-gray-900">
            <StatusBadge status={latestEx.status} />
          </span>
        )}
      </div>

      {/* Cuerpo */}
      <div className="flex gap-3 pt-7 pb-3 px-3">

        {/* [2][3] Izquierda — variant + parent */}
        <div className="flex flex-col gap-2 w-24 shrink-0">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-500 mb-0.5">Variant</label>
            <input
              className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-600"
              placeholder="v1_0001"
              value={variant}
              onChange={e => setVariant(e.target.value)}
              required
            />
          </div>
          {phase.parentRequired && (
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-500 mb-0.5">Parent</label>
              <input
                className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-600"
                placeholder="v1_0001"
                value={parent}
                onChange={e => setParent(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* [4] Centro — editor de parámetros */}
        <div className="flex-1 min-w-0">
          <ParamsEditor
            faseId={phase.id}
            onChange={parsed => { paramsRef.current = parsed }}
          />
        </div>

        {/* [5] Derecha — botón de acción */}
        <div className="flex items-stretch shrink-0">
          <button
            type="submit"
            disabled={isPending}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded px-2 transition-colors flex items-center justify-center"
            style={{ writingMode: 'vertical-rl', minHeight: '72px' }}
          >
            {isPending ? '···' : 'Ejecutar'}
          </button>
        </div>

      </div>
    </form>
  )
}
