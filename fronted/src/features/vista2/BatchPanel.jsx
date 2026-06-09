import { useState, useRef, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createExecution } from '../../api/executions'
import { paramsForPhase } from './phaseParams'

function phaseNum(phaseId) {
  return parseInt(phaseId.match(/^f(\d+)/)?.[1] ?? '1')
}

function nextVariant(phaseId, existing = []) {
  const n      = phaseNum(phaseId)
  const prefix = `v${n}_`
  const nums   = existing
    .filter(v => v.startsWith(prefix))
    .map(v => parseInt(v.slice(prefix.length)))
    .filter(x => !isNaN(x))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

function suggestParent(phaseId, executions = []) {
  const parentN = phaseNum(phaseId) - 1
  if (parentN < 1) return ''
  const prefix = `v${parentN}_`
  return executions
    .filter(e => e.variant?.startsWith(prefix))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    ?.variant ?? `${prefix}0001`
}

function parseRawParams(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

function buildPhaseParams(faseId, params, phaseParams) {
  const defs = paramsForPhase(phaseParams, faseId)
  if (defs.length === 0) return params && Object.keys(params).length > 0 ? params : {}
  const result = {}
  for (const def of defs) {
    const sug = params?.[def.id]
    if (sug !== undefined && sug !== null && sug !== '') {
      result[def.id] = sug
    } else if (def.type === 'integer' || def.type === 'float') {
      result[def.id] = null
    } else if (def.type === 'boolean') {
      result[def.id] = false
    } else if (def.type === 'select') {
      result[def.id] = def.options?.[0] ?? ''
    } else if (def.type === 'json') {
      try { result[def.id] = def.hint ? JSON.parse(def.hint) : [] }
      catch { result[def.id] = [] }
    } else {
      result[def.id] = ''
    }
  }
  return result
}

function buildTemplate(phases, executions, phaseParams) {
  return phases.map(phase => {
    const latestEx  = executions?.filter(e => e.fase === phase.id)[0]
    const params    = buildPhaseParams(phase.id, parseRawParams(latestEx?.params), phaseParams)
    const existing  = executions?.filter(e => e.fase === phase.id).map(e => e.variant).filter(Boolean) ?? []
    const entry     = { variant: nextVariant(phase.id, existing), params }
    if (phase.parentRequired) entry.parent = suggestParent(phase.id, executions ?? [])
    if (phase.availableRunners?.length > 1) entry.selected_runner = phase.availableRunners[0].id
    return `#${phase.id}\n\n${JSON.stringify(entry, null, 2)}`
  }).join('\n\n\n')
}

function parseBatch(raw, phaseIds, phaseParams) {
  const sections = []
  let currentPhase = null
  let currentLines = []

  for (const line of raw.split('\n')) {
    const m = line.match(/^#(\S+)/)
    if (m) {
      if (currentPhase !== null) sections.push({ phase: currentPhase, content: currentLines.join('\n') })
      currentPhase = m[1]
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  if (currentPhase !== null) sections.push({ phase: currentPhase, content: currentLines.join('\n') })

  const entries  = []
  const errors   = []
  const warnings = []

  for (const { phase, content } of sections) {
    if (!phaseIds.has(phase)) {
      errors.push(`Fase desconocida: "${phase}"`)
      continue
    }
    const defs        = paramsForPhase(phaseParams, phase)
    const requiredIds = new Set(defs.filter(d => d.required).map(d => d.id))
    const normalized  = content.replace(/}[ \t]*,?[ \t]*\n[ \t]*{/g, '}\n\n{')
    const blocks      = normalized.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    for (const block of blocks) {
      try {
        const obj = JSON.parse(block)
        if (!obj || typeof obj.variant !== 'string' || !obj.variant.trim()) {
          errors.push(`#${phase}: bloque sin "variant"`)
          continue
        }
        const cleanParams = Object.fromEntries(
          Object.entries(obj.params ?? {}).filter(([, v]) => v !== '' && v !== null)
        )
        for (const id of requiredIds) {
          if (cleanParams[id] === undefined) {
            const label = defs.find(d => d.id === id)?.label ?? id
            warnings.push(`#${phase} "${label}" obligatorio vacío en ${obj.variant.trim()}`)
          }
        }
        const rawParent = obj.parent ?? null
        entries.push({
          fase:            phase,
          variant:         obj.variant.trim(),
          parent:          Array.isArray(rawParent) ? JSON.stringify(rawParent) : rawParent,
          params:          cleanParams,
          selected_runner: obj.selected_runner ?? null,
        })
      } catch (e) {
        errors.push(`#${phase}: JSON inválido — ${e.message}`)
      }
    }
  }

  return { entries, errors, warnings }
}

export default function BatchPanel({ phases, executions, onWarnings, pipelineId, color, phaseParams }) {
  const qc       = useQueryClient()
  const phaseIds = useMemo(() => new Set(phases.map(p => p.id)), [phases])
  const storageKey = `v2_${pipelineId ?? 'default'}_batch_input`

  const templateKey = useMemo(
    () => phases.map(p => `${p.id}:${executions?.filter(e => e.fase === p.id)[0]?.id ?? ''}`).join('|'),
    [phases, executions]
  )

  const [input,         setInput]         = useState(() =>
    localStorage.getItem(storageKey) ?? buildTemplate(phases, executions, phaseParams)
  )
  const [submitResults, setSubmitResults] = useState(null)
  const [isPending,     setIsPending]     = useState(false)
  const textareaRef = useRef(null)
  const userEdited  = useRef(!!localStorage.getItem(storageKey))

  useEffect(() => {
    if (userEdited.current) localStorage.setItem(storageKey, input)
  }, [input, storageKey])

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    userEdited.current = !!saved
    setInput(saved ?? buildTemplate(phases, executions, phaseParams))
  }, [storageKey, phaseParams])

  useEffect(() => {
    if (userEdited.current) return
    setInput(buildTemplate(phases, executions, phaseParams))
  }, [templateKey, phaseParams]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleReset() {
    userEdited.current = false
    localStorage.removeItem(storageKey)
    setInput(buildTemplate(phases, executions, phaseParams))
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [input])

  const parsed    = useMemo(() => parseBatch(input, phaseIds, phaseParams), [input, phaseIds, phaseParams])
  const hasErrors = parsed.errors.length > 0
  const count     = parsed.entries.length

  useEffect(() => { onWarnings?.(parsed.warnings ?? []) }, [parsed])

  async function handleSubmit(e) {
    e.preventDefault()
    if (isPending || hasErrors || count === 0) return
    setIsPending(true)
    setSubmitResults(null)

    const settled = await Promise.allSettled(
      parsed.entries.map(entry => createExecution({ pipeline_id: pipelineId, ...entry }))
    )

    const ok     = []
    const errors = {}
    settled.forEach((r, i) => {
      const key = `${parsed.entries[i].fase} / ${parsed.entries[i].variant}`
      if (r.status === 'fulfilled') ok.push(key)
      else errors[key] = r.reason?.message ?? 'Error'
    })

    if (ok.length > 0) qc.invalidateQueries({ queryKey: ['executions'] })
    setSubmitResults({ ok, errors })
    setIsPending(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">
          {hasErrors ? (
            <span className="text-red-400">
              {parsed.errors.length} error{parsed.errors.length !== 1 ? 'es' : ''}
            </span>
          ) : count > 0 ? (
            <span className="text-green-600 dark:text-green-400">
              {count} ejecución{count !== 1 ? 'es' : ''} listas
            </span>
          ) : (
            <span className="text-gray-500 dark:text-gray-500">Sin entradas</span>
          )}
        </span>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs border border-gray-300 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded px-2 py-1 transition-colors"
          >
            Reiniciar
          </button>
          <button
            type="submit"
            disabled={isPending || hasErrors || count === 0}
            className="text-xs disabled:opacity-50 text-white font-semibold rounded px-3 py-1 transition-opacity"
            style={{ backgroundColor: color ?? '#6366f1' }}
          >
            {isPending ? '···' : `Ejecutar (${count})`}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-xs text-gray-900 font-mono resize-none overflow-hidden focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
        style={{ minHeight: '240px' }}
        value={input}
        onChange={e => { setInput(e.target.value); userEdited.current = true }}
        spellCheck={false}
      />

      {/* Validation errors */}
      {hasErrors && (
        <div className="flex flex-col gap-1">
          {parsed.errors.map((err, i) => (
            <div key={i} className="text-xs text-red-400 font-mono">{err}</div>
          ))}
        </div>
      )}

      {/* Submit results */}
      {submitResults && (
        <div className="flex flex-col gap-1">
          {submitResults.ok.length > 0 && (
            <div className="text-xs text-green-600 dark:text-green-400">
              ✓ {submitResults.ok.length} creadas
            </div>
          )}
          {Object.entries(submitResults.errors).map(([k, err]) => (
            <div key={k} className="text-xs text-red-400 font-mono truncate">{k}: {err}</div>
          ))}
        </div>
      )}

    </form>
  )
}
