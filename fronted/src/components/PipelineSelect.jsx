import { useState, useEffect, useRef } from 'react'

export default function PipelineSelect({ value, onChange, projects = [], disabled = false, showAll = true }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const selected = projects.find(p => p.id === value) ?? null
  const options  = showAll ? [{ id: '', label: 'Todos', color: null }, ...projects] : projects

  if (disabled) {
    return (
      <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-400 cursor-not-allowed opacity-60 dark:bg-gray-800 dark:border-gray-700">
        {selected?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />}
        <span className="truncate">{selected?.label ?? (showAll ? 'Todos' : '—')}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="flex-1 min-w-0 relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none hover:border-gray-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:hover:border-gray-500"
        style={selected?.color ? { borderColor: selected.color + 'aa' } : undefined}
      >
        {selected?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />}
        <span className="flex-1 text-left truncate">{selected?.label ?? (showAll ? 'Todos' : '—')}</span>
        <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-0.5 z-50 min-w-full bg-white border border-gray-200 rounded shadow-lg dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
          {options.map(p => (
            <button
              key={p.id ?? '__all'}
              type="button"
              onClick={() => { onChange(p.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                p.id === value
                  ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              } text-gray-900 dark:text-gray-100`}
            >
              {p.color
                ? <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                : <span className="w-2 h-2 shrink-0" />
              }
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
