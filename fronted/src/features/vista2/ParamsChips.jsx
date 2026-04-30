export default function ParamsChips({ params }) {
  const p = typeof params === 'string'
    ? (() => { try { return JSON.parse(params) } catch { return {} } })()
    : (params ?? {})
  const entries = Object.entries(p)
  if (!entries.length) return null

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-center rounded overflow-hidden text-[10px] border border-gray-200 dark:border-gray-700"
        >
          <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold px-1.5 py-0.5 tracking-wide">
            {k}
          </span>
          <span className="bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 font-mono px-1.5 py-0.5">
            {Array.isArray(v) ? v.join(', ') : String(v)}
          </span>
        </span>
      ))}
    </div>
  )
}
