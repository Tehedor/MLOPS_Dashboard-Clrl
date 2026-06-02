import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createExecution } from '../../api/executions'
import { getRows, checkVariantExists } from '../../api/variants'
import { PHASE_PARAMS, PHASE_PARENT_VARIANT } from './phaseParams'
import ParamsEditor from './ParamsEditor'

function phaseNum(phaseId) {
  return parseInt(phaseId.match(/^f(\d+)/)?.[1] ?? '1')
}

const ACTIVE_STATUSES = new Set(['queued', 'waiting_parent', 'dispatching', 'running'])

function normalizeVariant(phaseId, variant) {
  const v = variant.trim()
  if (/^v\d_\d{4}$/.test(v)) return v
  const m = v.match(/^v?(\d{1,4})$/)
  if (m) {
    const pm = phaseId.match(/\d{2}/)
    if (pm) {
      const phaseDigit = parseInt(pm[0], 10)
      return `v${phaseDigit}_${String(parseInt(m[1], 10)).padStart(4, '0')}`
    }
  }
  return v
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

function suggestParent(phaseId, executions = [], mode = 'single') {
  const parentN = phaseNum(phaseId) - 1
  if (parentN < 1) return ''
  const prefix = `v${parentN}_`
  const variants = executions
    .filter(e => e.variant?.startsWith(prefix))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(e => e.variant)
  if (mode === 'multi') {
    const top = variants.slice(0, 3)
    return top.length > 0 ? JSON.stringify(top) : `["${prefix}0001"]`
  }
  return variants[0] ?? `${prefix}0001`
}

function parseRawParams(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

function buildJsonTemplate(faseId, params, availableRunners) {
  const defs = PHASE_PARAMS[faseId] ?? []
  let templateParams
  if (defs.length > 0) {
    templateParams = {}
    for (const def of defs) {
      const sug = params?.[def.id]
      if (sug !== undefined && sug !== null && sug !== '') {
        templateParams[def.id] = sug
      } else if (def.type === 'integer' || def.type === 'float') {
        templateParams[def.id] = null
      } else if (def.type === 'boolean') {
        templateParams[def.id] = false
      } else if (def.type === 'select') {
        templateParams[def.id] = def.options?.[0] ?? ''
      } else if (def.type === 'json') {
        try { templateParams[def.id] = def.hint ? JSON.parse(def.hint) : [] }
        catch { templateParams[def.id] = [] }
      } else {
        templateParams[def.id] = ''
      }
    }
  } else {
    templateParams = params && Object.keys(params).length > 0 ? params : {}
  }
  const pvDef = PHASE_PARENT_VARIANT[faseId]
  const obj = { variant: `v${phaseNum(faseId)}_0001`, params: templateParams }
  if (pvDef) obj.parent = pvDef.mode === 'multi' ? [] : ''
  if (availableRunners?.length > 1) obj.selected_runner = availableRunners[0]?.id ?? null
  return JSON.stringify(obj, null, 2)
}

function parseJsonInput(raw, faseId) {
  const defs        = PHASE_PARAMS[faseId] ?? []
  const requiredIds = new Set(defs.filter(d => d.required).map(d => d.id))
  const blocks      = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  if (blocks.length === 0) return { entries: [], error: 'Sin entradas', warnings: [] }
  const entries  = []
  const warnings = []
  for (const block of blocks) {
    try {
      const obj = JSON.parse(block)
      if (!obj || typeof obj.variant !== 'string' || !obj.variant.trim())
        return { entries: [], error: 'Bloque sin "variant"', warnings: [] }
      // Filtrar vacíos
      const cleanParams = Object.fromEntries(
        Object.entries(obj.params ?? {}).filter(([, v]) => v !== '' && v !== null)
      )
      entries.push({ ...obj, params: cleanParams })
      // Avisos de obligatorios
      for (const id of requiredIds) {
        if (cleanParams[id] === undefined) {
          const label = defs.find(d => d.id === id)?.label ?? id
          warnings.push(`"${label}" obligatorio vacío en ${obj.variant.trim()}`)
        }
      }
    } catch (e) {
      return { entries: [], error: `JSON inválido: ${e.message}`, warnings: [] }
    }
  }
  return { entries, error: entries.length === 0 ? 'Sin variantes válidas' : null, warnings }
}

function TabBtn({ label, active, onClick, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-current'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300'
      }`}
      style={active ? { color, borderColor: color } : undefined}
    >
      {label}
    </button>
  )
}

export default function PhaseCard({ phase, executions, preload, onPreloadConsumed, pipelineId, color }) {
  const qc = useQueryClient()

  const parentDef  = PHASE_PARENT_VARIANT[phase.id]
  const parentMode = parentDef?.mode ?? 'single'
  const showParent = !!(phase.parentRequired || parentDef)

  // Calcular params sugeridos antes de los estados (necesario para el template inicial)
  const latestExInit = executions?.filter(e => e.fase === phase.id)[0]
  const initParams   = parseRawParams(latestExInit?.params)

  const [variant,        setVariant]        = useState(() => localStorage.getItem(`pc_${phase.id}_variant`) ?? '')
  const [parent,         setParent]         = useState(() => localStorage.getItem(`pc_${phase.id}_parent`)  ?? '')
  const [selectedRunner, setSelectedRunner] = useState(() => phase.availableRunners?.[0]?.id ?? '')
  const paramsRef = useRef({})

  // Tabs
  const [tab, setTab] = useState('single')

  // JSON tab
  const [jsonInput,   setJsonInput]   = useState(() => buildJsonTemplate(phase.id, initParams, phase.availableRunners))
  const [jsonErrors,  setJsonErrors]  = useState({})
  const [jsonPending, setJsonPending] = useState(false)
  const userEditedJson  = useRef(false)
  const jsonTextareaRef = useRef(null)

  // Combobox
  const [showDropdown, setShowDropdown] = useState(false)

  // Inline error (single)
  const [errorMsg,   setErrorMsg]   = useState(null)
  const [isChecking, setIsChecking] = useState(false)

  // Pre-fill
  const [preloadKey,    setPreloadKey]    = useState(0)
  const [preloadParams, setPreloadParams] = useState(null)

  useEffect(() => { localStorage.setItem(`pc_${phase.id}_variant`, variant) }, [variant, phase.id])
  useEffect(() => { localStorage.setItem(`pc_${phase.id}_parent`,  parent)  }, [parent,  phase.id])

  useEffect(() => {
    if (!preload) return
    setVariant(preload.variant ?? '')
    setParent(preload.parent ?? '')
    const parsed = parseRawParams(preload.params)
    setPreloadParams(parsed)
    setPreloadKey(k => k + 1)
    setTab('single')
    onPreloadConsumed?.()
  }, [preload])

  const latestEx         = executions?.filter(e => e.fase === phase.id)[0]
  const suggestedVariant = latestEx?.variant ?? ''
  const suggestedParams  = parseRawParams(latestEx?.params)

  // Actualizar template JSON cuando llegan los params reales (solo si el usuario no ha editado)
  const suggestedParamsKey = latestEx ? JSON.stringify(suggestedParams) : ''
  useEffect(() => {
    if (userEditedJson.current) return
    setJsonInput(buildJsonTemplate(phase.id, suggestedParams, phase.availableRunners))
  }, [suggestedParamsKey])

  // Auto-resize del textarea JSON
  useEffect(() => {
    const el = jsonTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [jsonInput, tab])

  const { data: variantOptions = [] } = useQuery({
    queryKey: ['variants-picker', phase.id, pipelineId],
    queryFn:  () => getRows({ phase: phase.id, pipeline_id: pipelineId, limit: 200, sort_by: 'variant', sort_dir: 'asc' }),
    enabled: !!pipelineId,
    staleTime: 60_000,
    select: data => {
      const arr = Array.isArray(data) ? data : (data?.rows ?? [])
      return arr.map(r => typeof r === 'string' ? r : (r?.variant ?? '')).filter(Boolean)
    },
  })
  const filteredOptions = variant
    ? variantOptions.filter(v => v.toLowerCase().includes(variant.toLowerCase()))
    : variantOptions

  const { mutate, isPending } = useMutation({
    mutationFn: createExecution,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['executions'] }); setErrorMsg(null) },
    onError: (err) => setErrorMsg(err.message ?? 'Error al crear ejecución'),
  })

  const parsedJson = parseJsonInput(jsonInput, phase.id)

  async function handleSubmit(e) {
    e.preventDefault()
    if (paramsRef.current === null && tab === 'single') return

    if (tab === 'json') {
      if (parsedJson.error || parsedJson.entries.length === 0) return
      setJsonPending(true)
      setJsonErrors({})
      // Check cola activa + filesystem para cada variante
      const existChecks = await Promise.allSettled(
        parsedJson.entries.map(e => checkVariantExists(phase.id, e.variant.trim(), pipelineId))
      )
      const existingErrors = {}
      const toDispatch = parsedJson.entries.filter((entry, i) => {
        const norm = normalizeVariant(phase.id, entry.variant.trim())
        // Cola activa
        const activeEx = executions?.find(
          e => e.fase === phase.id && e.variant === norm && ACTIVE_STATUSES.has(e.status)
        )
        if (activeEx) {
          existingErrors[norm] = `Ejecución activa (${activeEx.status})`
          return false
        }
        // Filesystem: solo bloquea si completada
        const result = existChecks[i]
        if (result.status === 'fulfilled' && result.value?.exists && result.value?.status === 'completed') {
          existingErrors[result.value.normalized ?? norm] = 'Ya existe y fue completada'
          return false
        }
        return true
      })
      if (toDispatch.length === 0) {
        setJsonErrors(existingErrors)
        setJsonPending(false)
        return
      }
      const results = await Promise.allSettled(
        toDispatch.map(entry => createExecution({
          pipeline_id:     pipelineId,
          fase:            phase.id,
          variant:         entry.variant.trim(),
          parent:          entry.parent ?? null,
          params:          entry.params ?? {},
          selected_runner: entry.selected_runner ?? selectedRunner ?? null,
        }))
      )
      const errors = { ...existingErrors }
      let anySuccess = false
      results.forEach((r, i) => {
        if (r.status === 'rejected') errors[toDispatch[i].variant] = r.reason?.message ?? 'Error'
        else anySuccess = true
      })
      if (anySuccess) qc.invalidateQueries({ queryKey: ['executions'] })
      setJsonErrors(errors)
      setJsonPending(false)
    } else {
      const finalVariant = variant.trim()
      if (!finalVariant) {
        setErrorMsg('Introduce una variante')
        return
      }
      const normalized = normalizeVariant(phase.id, finalVariant)

      // 1. Chequeo de cola: bloquea si ya hay una ejecución activa para esta variante
      const activeExecution = executions?.find(
        e => e.fase === phase.id && e.variant === normalized && ACTIVE_STATUSES.has(e.status)
      )
      if (activeExecution) {
        setErrorMsg(`"${normalized}" ya tiene una ejecución activa (${activeExecution.status})`)
        return
      }

      // 2. Chequeo de filesystem: bloquea solo si completada, permite si falló
      setIsChecking(true)
      try {
        const { exists, status } = await checkVariantExists(phase.id, finalVariant, pipelineId)
        if (exists && status === 'completed') {
          setErrorMsg(`La variante "${normalized}" ya existe y fue completada`)
          return
        }
      } catch {
        // Si falla el check, deja pasar — el backend rechazará si es duplicado
      } finally {
        setIsChecking(false)
      }

      setErrorMsg(null)
      let parentValue = parent.trim() || null
      if (parentValue && parentMode === 'multi' && !parentValue.startsWith('[')) {
        parentValue = JSON.stringify(parentValue.split(',').map(s => s.trim()).filter(Boolean))
      }
      mutate({
        pipeline_id: pipelineId,
        fase: phase.id, variant: normalized,
        parent: parentValue,
        params: paramsRef.current,
        selected_runner: selectedRunner || null,
      })
    }
  }

  const isSubmitting = tab === 'json' ? jsonPending : (isPending || isChecking)
  const jsonCount    = parsedJson.entries.length
  const btnLabel     = isSubmitting ? '···'
    : (tab === 'json' && jsonCount > 0) ? `Ejecutar (${jsonCount})`
    : 'Ejecutar'
  const btnDisabled  = isSubmitting || (tab === 'json' && (!!parsedJson.error || jsonCount === 0))

  return (
    <form
      onSubmit={handleSubmit}
      className="relative border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900"
    >
      {/* Título superpuesto */}
      <div className="absolute -top-px left-0 right-0 flex items-center gap-1.5 px-3">
        <span
          className="text-white text-xs font-semibold px-2 py-0.5 rounded-b"
          style={{ backgroundColor: color ?? '#6366f1' }}
        >
          {phase.label}
        </span>
        {phase.availableRunners?.length > 1 ? (
          <select
            value={selectedRunner}
            onChange={e => setSelectedRunner(e.target.value)}
            onClick={e => e.stopPropagation()}
            className="bg-gray-200 border border-gray-300 text-gray-700 text-xs px-1.5 py-0.5 rounded-b dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 focus:outline-none focus:border-indigo-500"
          >
            {phase.availableRunners.map(r => (
              <option key={r.id} value={r.id}>{r.id}</option>
            ))}
          </select>
        ) : (
          <span className="bg-gray-200 border border-gray-300 text-gray-700 text-xs px-2 py-0.5 rounded-b dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
            {selectedRunner || phase.runner}
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center pt-6 px-3 border-b border-gray-200 dark:border-gray-800">
        <TabBtn label="Single" active={tab === 'single'} onClick={() => { setTab('single'); setErrorMsg(null) }} color={color} />
        <TabBtn label="Multi JSON" active={tab === 'json'} onClick={() => { setTab('json'); setJsonErrors({}) }} color={color} />
      </div>

      {/* ── Tab: Single ── */}
      {tab === 'single' && (
        <div className="flex gap-3 py-3 px-3">
          <div className="flex flex-col gap-2 w-24 shrink-0">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-500 mb-0.5">Variant</label>
              <div className="relative">
                <input
                  className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-600"
                  placeholder={nextVariant(phase.id, variantOptions)}
                  value={variant}
                  onChange={e => { setVariant(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                />
                {showDropdown && filteredOptions.length > 0 && (
                  <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-gray-300 rounded shadow-lg max-h-36 overflow-y-auto text-xs dark:bg-gray-800 dark:border-gray-700">
                    {filteredOptions.slice(0, 15).map(opt => (
                      <li
                        key={opt}
                        onMouseDown={() => { setVariant(opt); setShowDropdown(false) }}
                        className="px-2 py-1 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-900 dark:text-gray-100 truncate"
                      >
                        {opt}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {showParent && (
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-500 mb-0.5">
                  {parentMode === 'multi' ? 'Parents' : 'Parent'}
                </label>
                <input
                  className={`w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-600${parentMode === 'multi' ? ' font-mono' : ''}`}
                  placeholder={suggestParent(phase.id, executions, parentMode)}
                  value={parent}
                  onChange={e => setParent(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <ParamsEditor
              faseId={phase.id}
              suggestions={suggestedParams}
              onChange={parsed => { paramsRef.current = parsed }}
              externalKey={preloadKey}
              externalParams={preloadParams}
            />
          </div>

          <div className="flex items-stretch shrink-0">
            <button
              type="submit"
              disabled={isPending}
              className="disabled:opacity-50 text-white text-xs font-semibold rounded px-2 transition-opacity flex items-center justify-center"
              style={{ backgroundColor: color ?? '#6366f1', writingMode: 'vertical-rl', minHeight: '72px' }}
            >
              {isPending ? '···' : 'Ejecutar'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Multi JSON ── */}
      {tab === 'json' && (
        <div className="flex gap-3 py-3 px-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <textarea
              ref={jsonTextareaRef}
              className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-900 font-mono resize-none overflow-hidden focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              style={{ minHeight: '80px' }}
              value={jsonInput}
              onChange={e => { setJsonInput(e.target.value); userEditedJson.current = true }}
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              {parsedJson.error ? (
                <span className="text-xs text-red-400">{parsedJson.error}</span>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-500">
                  {jsonCount} ejecución{jsonCount !== 1 ? 'es' : ''}
                </span>
              )}
            </div>
            {parsedJson.warnings?.map((w, i) => (
              <div key={i} className="text-xs text-yellow-500 dark:text-yellow-400 font-mono">{w}</div>
            ))}
            {Object.entries(jsonErrors).map(([v, err]) => (
              <div key={v} className="text-xs text-red-400 font-mono truncate">{v}: {err}</div>
            ))}
          </div>

          <div className="flex items-stretch shrink-0">
            <button
              type="submit"
              disabled={btnDisabled}
              className="disabled:opacity-50 text-white text-xs font-semibold rounded px-2 transition-opacity flex items-center justify-center"
              style={{ backgroundColor: color ?? '#6366f1', writingMode: 'vertical-rl', minHeight: '72px' }}
            >
              {btnLabel}
            </button>
          </div>
        </div>
      )}

      {/* Error footer single */}
      {tab === 'single' && errorMsg && (
        <div className="flex items-center gap-2 px-3 pb-2 text-xs text-red-400">
          <span className="flex-1">{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="shrink-0 hover:text-red-300 transition-colors">✕</button>
        </div>
      )}
    </form>
  )
}
