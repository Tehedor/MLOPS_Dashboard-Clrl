import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getBranchStatus, getSetupStatus, startSetup, subscribeSetupLogs } from '../../api/setup'

// ── Log viewer ────────────────────────────────────────────────────────────────

function SetupLogViewer({ lines, running, status }) {
  const containerRef = useRef(null)
  const atBottomRef  = useRef(true)

  useEffect(() => {
    if (atBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const statusColor = status === 'done'
    ? 'text-green-400'
    : status === 'failed'
    ? 'text-red-400'
    : 'text-yellow-400'

  return (
    <div className="mt-2 rounded border border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-900 border-b border-gray-700">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Setup logs</span>
        {running && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-yellow-500">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            RUNNING
          </span>
        )}
        {!running && status && (
          <span className={`text-[10px] font-semibold ${statusColor} uppercase`}>{status}</span>
        )}
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="font-mono text-[11px] bg-gray-950 text-gray-300 overflow-y-auto"
        style={{ maxHeight: '220px' }}
      >
        {lines.length === 0 && (
          <p className="px-2 py-2 text-gray-600 italic text-[11px]">Esperando logs…</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className="px-2 py-px whitespace-pre-wrap break-all leading-4">{line}</div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const DEFAULT_CMD = 'make setup SETUP_CFG=setup/remote2.yaml'

export default function PipelineProjectSetup({ pipelineId, pipeline = null }) {
  const qc = useQueryClient()

  const [setupLogs,    setSetupLogs]    = useState([])
  const [setupStatus,  setSetupStatus]  = useState('idle')  // idle|running|done|failed
  const [showLogs,     setShowLogs]     = useState(false)

  const commandStart = pipeline?.command_start ?? DEFAULT_CMD

  // ── Branch status ──────────────────────────────────────────────────────────

  const { data: branchStatus, isLoading: branchLoading, refetch: refetchBranch } = useQuery({
    queryKey: ['branch-status', pipelineId],
    queryFn:  () => getBranchStatus(pipelineId),
    enabled:  !!pipelineId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  // ── Setup ──────────────────────────────────────────────────────────────────

  const setupCloserRef = useRef(null)
  const refetchBranchRef = useRef(refetchBranch)
  useEffect(() => { refetchBranchRef.current = refetchBranch }, [refetchBranch])

  // On pipeline change: close existing SSE, then restore backend state
  useEffect(() => {
    if (setupCloserRef.current) { setupCloserRef.current(); setupCloserRef.current = null }
    setSetupLogs([])
    setSetupStatus('idle')
    setShowLogs(false)
    if (!pipelineId) return

    getSetupStatus(pipelineId).then(({ status, logs }) => {
      if (!status || status === 'idle') return
      if (status === 'running') {
        // Re-attach to SSE — backend replays past logs then streams new ones
        setSetupStatus('running')
        setShowLogs(true)
        setupCloserRef.current = subscribeSetupLogs(
          pipelineId,
          (line) => setSetupLogs(prev => [...prev, line]),
          (finalStatus) => {
            setSetupStatus(finalStatus ?? 'done')
            qc.invalidateQueries({ queryKey: ['branch-status', pipelineId] })
            refetchBranchRef.current?.()
          },
        )
      } else {
        // done / failed — restore logs, no SSE needed
        setSetupLogs(logs ?? [])
        setSetupStatus(status)
        setShowLogs(true)
      }
    }).catch(() => {})

    return () => { if (setupCloserRef.current) { setupCloserRef.current(); setupCloserRef.current = null } }
  }, [pipelineId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStartSetup() {
    setSetupLogs([])
    setSetupStatus('running')
    setShowLogs(true)

    startSetup(pipelineId)

    if (setupCloserRef.current) setupCloserRef.current()
    setupCloserRef.current = subscribeSetupLogs(
      pipelineId,
      (line) => setSetupLogs(prev => [...prev, line]),
      (finalStatus) => {
        setSetupStatus(finalStatus ?? 'done')
        qc.invalidateQueries({ queryKey: ['branch-status', pipelineId] })
        refetchBranchRef.current?.()
      },
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!pipelineId) return null

  // Hide silently while loading — no "comprobando…" flash
  if (branchLoading) return null

  const branchExists  = branchStatus?.exists
  const initialized   = branchStatus?.initialized
  const branch        = branchStatus?.branch ?? '…'
  const setupRunning  = setupStatus === 'running'

  // Hide when fully initialized: idle (never ran) or done (just completed successfully)
  if (initialized && (setupStatus === 'idle' || setupStatus === 'done')) return null

  const showSetupUI = !initialized || setupStatus === 'running' || setupStatus === 'done' || setupStatus === 'failed'

  return (
    <div className="mx-4 mb-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
          Branch
        </span>
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
          branchExists
            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
        }`}>
          {branch}
        </span>
        <span className={`text-[10px] font-medium ${branchExists ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {branchExists ? '✓ existe' : '✗ no existe'}
        </span>
      </div>

      <div className="px-3 py-2 flex flex-col gap-2">

        {/* ── Arrancar pipeline ── */}
        {!branchLoading && showSetupUI && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={setupRunning}
                onClick={handleStartSetup}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded px-3 py-1.5 transition-colors"
              >
                {setupRunning ? 'Ejecutando…' : 'Arrancar proyecto'}
              </button>
              {(setupStatus === 'done' || setupStatus === 'failed') && (
                <span className={`text-xs font-semibold ${
                  setupStatus === 'done' ? 'text-green-500' : 'text-red-400'
                }`}>
                  {setupStatus === 'done' ? '✓ Listo' : '✗ Falló'}
                </span>
              )}
              {setupLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLogs(v => !v)}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showLogs ? 'Ocultar logs' : 'Ver logs'}
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
              {commandStart}
            </p>
            {showLogs && (
              <SetupLogViewer
                lines={setupLogs}
                running={setupRunning}
                status={setupStatus !== 'idle' && setupStatus !== 'running' && setupStatus !== 're-run' ? setupStatus : null}
              />
            )}
          </div>
        )}

      </div>
    </div>
  )
}
