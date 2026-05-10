import { useEffect, useRef, useState } from 'react'
import AnsiToHtml from 'ansi-to-html'
import { fetchLogs, getSupabase, subscribeLogs } from '../../api/supabase'

const converter = new AnsiToHtml({ escapeXML: true, fg: '#d1d5db', bg: '#111827' })

function AnsiBlock({ content }) {
  const html = converter.toHtml(content ?? '')
  return (
    <span
      className="block whitespace-pre-wrap break-all leading-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function LogViewer({ run, ghLogsCache = {}, ghLoadingSet = new Set(), onFetchGhLogs }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [localGroups, setLocalGroups] = useState({})
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const atBottomRef = useRef(true)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const isLocal   = run?._source === 'local'
  const isLive    = run?.status === 'in_progress' || run?.status === 'running'
  const ghRunId   = isLocal ? null : (run?.run_id ?? run?.gh_run_id)
  const ghLogs    = ghRunId ? (ghLogsCache[ghRunId] ?? null) : null
  const ghLoading = ghRunId ? ghLoadingSet.has(ghRunId) : false

  function scrollToBottom() {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
    setShowScrollBtn(false)
  }

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    atBottomRef.current = isBottom
    setShowScrollBtn(!isBottom)
  }

  // Supabase logs for GH runs
  useEffect(() => {
    if (!run || isLocal) { setLogs([]); return }

    setLoading(true)
    setLogs([])
    atBottomRef.current = false
    setShowScrollBtn(false)
    if (containerRef.current) containerRef.current.scrollTop = 0

    fetchLogs(run.run_id)
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false))

    const channel = subscribeLogs(run.run_id, (payload) => {
      setLogs((prev) => [...prev, payload.new])
    })

    return () => { getSupabase()?.removeChannel(channel) }
  }, [run?.run_id, isLocal])

  // Auto-fetch GH logs for completed runs (no button needed)
  useEffect(() => {
    if (!run || isLocal || !ghRunId) return
    if (run.conclusion && !ghLoadingSet.has(ghRunId) && !ghLogsCache[ghRunId]) {
      onFetchGhLogs?.(ghRunId)
    }
  }, [run?.run_id, run?.conclusion, isLocal])

  // SSE stream for local runs
  useEffect(() => {
    if (!run || !isLocal) { setLocalGroups({}); return }

    setLocalGroups({})
    setLoading(true)
    atBottomRef.current = true
    if (containerRef.current) containerRef.current.scrollTop = 0

    const sse = new EventSource(`/api/executions/${run.run_id}/local-logs/stream`)

    sse.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.done) {
        setLoading(false)
        sse.close()
        return
      }
      setLoading(false)
      const step = data.step || 'output'
      setLocalGroups(prev => {
        const existing = prev[step]
        if (!existing) return { ...prev, [step]: [{ id: step, content: data.line }] }
        const updated = { ...existing[0], content: existing[0].content + '\n' + data.line }
        return { ...prev, [step]: [updated] }
      })
    }

    sse.onerror = () => { setLoading(false); sse.close() }

    return () => sse.close()
  }, [run?.run_id, isLocal])

  // Scroll to top when GH logs arrive
  useEffect(() => {
    if (ghLogs && containerRef.current) containerRef.current.scrollTop = 0
  }, [ghLogs])

  // Auto-scroll if at bottom
  useEffect(() => {
    if (atBottomRef.current) {
      const el = containerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [logs, localGroups])

  if (!run) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-600">
        Selecciona un run para ver sus logs.
      </div>
    )
  }

  const displayGroups = isLocal
    ? localGroups
    : ghLogs
      ? Object.fromEntries(ghLogs.map(l => [l.step_name, [{ id: l.step_name, content: l.content }]]))
      : logs.reduce((acc, log) => {
          const key = log.step_name ?? 'output'
          if (!acc[key]) acc[key] = []
          acc[key].push(log)
          return acc
        }, {})

  const hasContent = Object.keys(displayGroups).length > 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
          {run.workflow_name ?? `run #${run.run_id}`}
        </span>
        {run.branch && (
          <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">
            @ {run.branch}
          </span>
        )}
        {isLive && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            LIVE
          </span>
        )}
        {!isLive && run.conclusion && (
          <span className={`text-[10px] font-semibold ${
            run.conclusion === 'success'
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}>
            {run.conclusion.toUpperCase()}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {isLocal && (
            <span className="text-[10px] text-purple-400 font-semibold">LOCAL</span>
          )}
          {!isLocal && ghLogs && (
            <span className="text-[10px] text-blue-400">GH</span>
          )}
          {!isLocal && ghRunId && (
            <button
              onClick={() => onFetchGhLogs?.(ghRunId)}
              disabled={ghLoading}
              title="Refrescar logs desde GitHub"
              className="text-[10px] px-2 py-0.5 rounded border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors disabled:opacity-40"
            >
              {ghLoading ? '…' : '↓ GH'}
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs bg-gray-950 text-gray-300 p-3 relative"
      >
        {loading && <p className="text-gray-500 italic">Cargando logs…</p>}

        {!loading && !hasContent && (
          <p className="text-gray-600 italic">
            {isLive ? 'Esperando logs…' : 'Sin logs registrados para este run.'}
          </p>
        )}

        {Object.entries(displayGroups).map(([step, stepLogs]) => (
          <div key={step} className="mb-4">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 border-b border-gray-800 pb-0.5">
              ▶ {step}
            </div>
            {stepLogs.map((log) => (
              <AnsiBlock key={log.id} content={log.content} />
            ))}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 z-10 px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-lg transition-colors"
        >
          ⬇ Ir al final
        </button>
      )}
    </div>
  )
}
