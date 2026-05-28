import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pullVariant, getJob, getRows } from '../../api/variants'
import { runCommand } from '../../api/services'

async function waitForJob(jobId) {
  for (;;) {
    await new Promise(r => setTimeout(r, 1500))
    const job = await getJob(jobId)
    if (job.status === 'done') return null
    if (job.status === 'failed') return job.error || 'DVC pull falló'
  }
}

const EXEC_ICON  = { completed: '✓', failed: '✗', running: '⟳', pending: '·' }
const EXEC_COLOR = {
  completed: 'text-green-500',
  failed:    'text-red-400',
  running:   'text-yellow-500',
  pending:   'text-gray-400',
}
const EXEC_TITLE = {
  completed: 'Ejecución completada',
  failed:    'Ejecución fallida',
  running:   'En ejecución',
  pending:   'Pendiente / no iniciado',
}

const DVC_DOT   = { local: '●', partial: '◑', not_local: '○', error: '●' }
const DVC_DOT_COLOR = {
  local:     'text-green-400',
  partial:   'text-yellow-400',
  not_local: 'text-gray-400',
  error:     'text-red-400',
}
const DVC_TITLE = {
  local:     'Artefactos locales',
  partial:   'Descarga parcial',
  not_local: 'No descargado',
  error:     'Error DVC',
}

function PhaseColumn({ phase, service, isUp, runningVariant, busy, onRun }) {
  const runCmd      = service.commands.find(c => c.command.startsWith('run_'))
  const variantEnvVar = service.variant_env_var ?? 'VARIANT'
  const extraParams = runCmd?.params?.filter(p => p.env_var !== variantEnvVar) ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['service-variants', phase],
    queryFn: () => getRows({ phase, limit: 500 }),
    staleTime: 30_000,
  })

  const variants = data?.rows ?? []
  const [extraValues, setExtraValues] = useState({})

  function setParam(variantId, envVar, val) {
    setExtraValues(prev => ({ ...prev, [`${variantId}::${envVar}`]: val }))
  }

  function getExtraEnv(variantId) {
    return Object.fromEntries(
      extraParams.map(p => [
        p.env_var,
        extraValues[`${variantId}::${p.env_var}`] ?? p.options?.[0] ?? '',
      ])
    )
  }

  return (
    <div className="flex flex-col border-r border-gray-200 dark:border-gray-800 min-w-[260px] flex-1">
      <div className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 shrink-0">
        {phase}
        <span className="ml-1 font-normal text-gray-400">({variants.length})</span>
      </div>

      {isLoading && (
        <div className="px-3 py-2 text-xs text-gray-400">Cargando…</div>
      )}

      <div className="overflow-y-auto flex-1">
        {variants.map(row => {
          const localStatus   = row._local?.status ?? 'not_local'
          const execStatus    = row._execution_status ?? 'pending'
          const isRunningThis = isUp && runningVariant?.variant === row.variant && runningVariant?.phase === phase

          return (
            <div
              key={row.variant}
              className={`flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 dark:border-gray-900 ${
                isRunningThis ? 'bg-green-50 dark:bg-green-900/10' : ''
              }`}
            >
              {/* Execution status (main) + DVC local dot (secondary) */}
              <span className="flex items-center gap-0.5 shrink-0">
                <span
                  title={EXEC_TITLE[execStatus] ?? execStatus}
                  className={`text-xs font-bold leading-none ${EXEC_COLOR[execStatus] ?? 'text-gray-400'}`}
                >
                  {EXEC_ICON[execStatus] ?? '·'}
                </span>
                <span
                  title={DVC_TITLE[localStatus] ?? localStatus}
                  className={`text-[9px] leading-none ${DVC_DOT_COLOR[localStatus] ?? 'text-gray-400'}`}
                >
                  {DVC_DOT[localStatus] ?? '○'}
                </span>
              </span>

              {/* Variant name */}
              <span className="text-xs font-mono text-gray-700 dark:text-gray-300 flex-1 truncate">
                {row.variant}
              </span>

              {/* Extra params inline */}
              {extraParams.map(param =>
                param.type === 'select' ? (
                  <select
                    key={param.env_var}
                    value={extraValues[`${row.variant}::${param.env_var}`] ?? param.options?.[0] ?? ''}
                    onChange={e => setParam(row.variant, param.env_var, e.target.value)}
                    disabled={busy || isUp}
                    title={param.name}
                    className="text-xs rounded border px-1 py-0.5 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 disabled:opacity-40"
                  >
                    {param.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    key={param.env_var}
                    type="text"
                    value={extraValues[`${row.variant}::${param.env_var}`] ?? ''}
                    onChange={e => setParam(row.variant, param.env_var, e.target.value)}
                    disabled={busy || isUp}
                    placeholder={param.placeholder ?? param.env_var}
                    title={param.name}
                    className="text-xs rounded border px-1 py-0.5 w-20 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 placeholder:text-gray-400 disabled:opacity-40"
                  />
                )
              )}

                  {/* Run / Running indicator */}
              {isRunningThis ? (
                <span className="text-xs text-green-500 shrink-0">● Running</span>
              ) : isUp ? (
                <span className="text-xs text-gray-300 dark:text-gray-700 shrink-0 w-8 text-center">—</span>
              ) : (
                <button
                  onClick={() => {
                    // Build composite VARIANT key: if row has a parent → "T{parent}_E{variant}"
                    // otherwise use the variant name directly
                    const variantKey = row._parent
                      ? `T${row._parent}_E${row.variant}`
                      : row.variant
                    onRun(
                      { phase, variant: row.variant, local_status: localStatus, variantKey },
                      getExtraEnv(row.variant)
                    )
                  }}
                  disabled={busy}
                  className="text-xs px-2 py-0.5 rounded border border-green-400 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-40 shrink-0"
                >
                  Run
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


export default function ServicePanel({ service, isUp }) {
  const { id, port, fases, commands, variant_env_var, variant_format } = service

  const runCmd  = commands.find(c => c.command.startsWith('run_'))
  const stopCmd = commands.find(c => c.command.startsWith('stop_'))

  const [runningVariant, setRunningVariant] = useState(() => {
    try {
      const saved = localStorage.getItem(`svc_running_${id}`)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [actionState, setActionState] = useState('idle')
  const [errorMsg, setErrorMsg]       = useState('')

  // Persist running variant across tab switches and page reloads
  useEffect(() => {
    if (runningVariant) localStorage.setItem(`svc_running_${id}`, JSON.stringify(runningVariant))
    else localStorage.removeItem(`svc_running_${id}`)
  }, [runningVariant, id])

  // Track previous isUp to avoid clearing runningVariant on initial mount (isUp starts false)
  const prevIsUpRef = useRef(isUp)
  useEffect(() => {
    const wasUp = prevIsUpRef.current
    prevIsUpRef.current = isUp

    if (isUp  && actionState === 'starting') setActionState('idle')
    if (!isUp && actionState === 'stopping') setActionState('idle')
    // Only clear when service transitions up → down, not on first render
    if (wasUp && !isUp && actionState === 'idle') setRunningVariant(null)
  }, [isUp, actionState])

  async function handleRun(variantInfo, extraEnv) {
    if (!runCmd) return
    setErrorMsg('')

    if (variantInfo.local_status !== 'local') {
      setActionState('pulling')
      try {
        const res = await pullVariant(variantInfo.phase, variantInfo.variant)
        const err = await waitForJob(res.job_id)
        if (err) { setActionState('error'); setErrorMsg(err); return }
      } catch (e) { setActionState('error'); setErrorMsg(e.message); return }
    }

    setActionState('starting')
    setRunningVariant(variantInfo)
    try {
      const envVar = variant_env_var ?? 'VARIANT'
      const useDirect = variant_format === 'direct'
      const key = useDirect ? variantInfo.variant : (variantInfo.variantKey ?? variantInfo.variant)
      await runCommand(id, runCmd.command, { [envVar]: key, ...extraEnv })
    } catch (e) { setActionState('error'); setErrorMsg(e.message) }
  }

  async function handleStop() {
    if (!stopCmd) return
    setActionState('stopping')
    try {
      await runCommand(id, stopCmd.command, {})
    } catch (e) { setActionState('error'); setErrorMsg(e.message) }
  }

  const busy = actionState !== 'idle'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{id}</span>
        <span className="text-xs text-gray-400">:{port}</span>

        {isUp ? (
          <>
            <span className="text-xs text-green-500">● Running</span>
            {runningVariant && (
              <span className="text-xs text-gray-400 font-mono">{runningVariant.variant}</span>
            )}
            <a
              href={`http://localhost:${port}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              Abrir →
            </a>
            <button
              onClick={handleStop}
              disabled={actionState === 'stopping'}
              className="text-xs px-2 py-0.5 rounded border border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
            >
              {actionState === 'stopping' ? '⟳ Parando…' : 'Parar'}
            </button>
          </>
        ) : actionState === 'pulling' ? (
          <span className="text-xs text-yellow-500">⟳ Descargando DVC…</span>
        ) : actionState === 'starting' ? (
          <span className="text-xs text-yellow-500">⟳ Arrancando…</span>
        ) : (
          <span className="text-xs text-gray-400">○ Parado</span>
        )}

        {errorMsg && (
          <div className="flex items-center gap-1 ml-2">
            <span className="text-xs text-red-500 truncate max-w-xs">{errorMsg}</span>
            <button
              onClick={() => { setActionState('idle'); setErrorMsg('') }}
              className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Phase columns */}
      <div className="flex flex-1 min-h-0 overflow-x-auto">
        {fases.map(phase => (
          <PhaseColumn
            key={phase}
            phase={phase}
            service={service}
            isUp={isUp}
            runningVariant={runningVariant}
            busy={busy}
            onRun={handleRun}
          />
        ))}
      </div>
    </div>
  )
}
