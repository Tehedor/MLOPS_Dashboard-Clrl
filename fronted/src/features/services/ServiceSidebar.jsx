export default function ServiceSidebar({ services, statusMap, selectedId, onSelect }) {
  return (
    <div className="w-44 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-800 shrink-0">
        Servicios
      </div>

      {services.map(svc => {
        const isUp = statusMap[svc.id] ?? false
        const isSelected = svc.id === selectedId

        return (
          <button
            key={svc.id}
            onClick={() => onSelect(svc.id)}
            className={`text-left px-3 py-2.5 border-b border-gray-100 dark:border-gray-900 w-full transition-colors ${
              isSelected
                ? 'bg-gray-100 dark:bg-gray-800'
                : 'hover:bg-gray-50 dark:hover:bg-gray-900'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-xs shrink-0 ${isUp ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`}>
                ●
              </span>
              <span className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                {svc.id}
              </span>
            </div>
            <div className="text-xs text-gray-400 pl-3.5">:{svc.port}</div>
            {isUp && (
              <a
                href={`http://localhost:${svc.port}`}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="pl-3.5 text-xs text-blue-500 hover:underline"
              >
                Abrir →
              </a>
            )}
          </button>
        )
      })}
    </div>
  )
}
