const STATUS_STYLES = {
  queued:      'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 animate-pulse',
  success:     'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  failure:     'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  cancelled:   'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.queued
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${style}`}>
      {status?.replace('_', ' ') ?? '—'}
    </span>
  )
}

export default function RunList({ runs, selectedRunId, onSelect, loading, pipelineProjects = {} }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-600">
        Cargando runs…
      </div>
    )
  }

  if (!runs.length) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-600 text-center px-4">
        Sin runs registrados.<br />Lanza un workflow en GitHub Actions.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-800 overflow-y-auto h-full">
      {runs.map((run) => {
        const project  = run.pipeline_id ? pipelineProjects[run.pipeline_id] : null
        const color    = project?.color ?? null
        const isActive = run.run_id === selectedRunId

        return (
          <li
            key={run.run_id}
            onClick={() => onSelect(run)}
            className={`relative pl-3 pr-3 py-2.5 cursor-pointer transition-colors ${
              isActive
                ? 'bg-gray-100 dark:bg-gray-900'
                : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
            }`}
          >
            {/* Borde izquierdo de color */}
            <div
              className="absolute left-0 top-0 bottom-0 w-0.5"
              style={{
                backgroundColor: color
                  ? (isActive ? color : color + '88')
                  : (isActive ? '#3b82f6' : 'transparent'),
              }}
            />

            {/* Fila superior: status + tiempo */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <StatusBadge status={run.status} />
              <span className="text-[10px] text-gray-400 dark:text-gray-600 shrink-0">
                {timeAgo(run.created_at)}
              </span>
            </div>

            {/* Fase + variante */}
            {(run.fase || run.variant) && (
              <div className="grid grid-cols-2 gap-x-2 min-w-0">
                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {run.fase ?? '—'}
                </span>
                {run.variant ? (() => {
                  const m = run.variant.match(/^(v\d+_?)(\d+)$/)
                  return (
                    <span className="font-mono leading-tight">
                      {m ? (
                        <>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{m[1]}</span>
                          <span className="text-base font-semibold text-gray-800 dark:text-gray-100">{m[2]}</span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-600 dark:text-gray-300">{run.variant}</span>
                      )}
                    </span>
                  )
                })() : <span />}
              </div>
            )}

            {/* Workflow name + branch */}
            <p className="text-[10px] text-gray-400 dark:text-gray-600 truncate mt-0.5">
              {run.workflow_name ?? `run #${run.run_id}`}
              {run.branch && <span className="ml-1">@ {run.branch}</span>}
            </p>

            {/* Pipeline chip */}
            {project && (
              <div className="mt-1 flex items-center gap-1">
                {color && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span
                  className="text-[10px] font-medium truncate"
                  style={{ color: color ?? undefined }}
                >
                  {project.label}
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
