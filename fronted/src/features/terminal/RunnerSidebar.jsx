import { useQuery } from '@tanstack/react-query'
import { getRunners } from '../../api/terminal'

function StatusDot({ active }) {
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
        active ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'
      }`}
    />
  )
}

export default function RunnerSidebar({ activeSessions, onConnect }) {
  const { data: runners = [], isError } = useQuery({
    queryKey: ['runners'],
    queryFn: getRunners,
    refetchInterval: 5000,
    retry: 2,
  })

  return (
    <div className="w-52 shrink-0 border-r flex flex-col border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
        Runners
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isError && (
          <p className="px-3 py-2 text-xs text-red-400">Error al cargar runners</p>
        )}

        {!isError && runners.length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400">Sin runners configurados</p>
        )}

        {runners.map(runner => {
          const count = activeSessions[runner.id] ?? 0
          return (
            <div key={runner.id} className="px-3 py-2 group">
              <div className="flex items-center gap-2">
                <StatusDot active={count > 0} />
                <span className="flex-1 text-sm font-medium truncate text-gray-800 dark:text-gray-200">
                  {runner.label}
                </span>
                <button
                  onClick={() => onConnect(runner.id)}
                  title={`Conectar a ${runner.id}`}
                  className="text-xs px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
                >
                  +
                </button>
              </div>
              <p className="pl-4 mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                {count > 0 ? `${count} sesión${count > 1 ? 'es' : ''}` : 'sin sesiones'}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
