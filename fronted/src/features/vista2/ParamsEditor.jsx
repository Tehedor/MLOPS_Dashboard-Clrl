import { useState, useEffect, useRef } from 'react'
import { PHASE_PARAMS } from './phaseParams'

/**
 * Editor de parámetros con dos modos:
 *  - 'json': textarea libre
 *  - 'form': inputs generados desde phaseParams.js
 *
 * onChange(params: object | null) — null si el JSON es inválido
 */
export default function ParamsEditor({ faseId, suggestions = {}, onChange }) {
  const defs = PHASE_PARAMS[faseId] ?? []

  const [mode, setMode]         = useState(() => localStorage.getItem(`pe_${faseId}_mode`) ?? 'form')
  const [raw, setRaw]           = useState(() => localStorage.getItem(`pe_${faseId}_raw`)  ?? generateTemplate(defs))
  const [rawError, setRawError] = useState(null)
  const [formValues, setFormValues] = useState(() => {
    try {
      const saved = localStorage.getItem(`pe_${faseId}_form`)
      return saved ? JSON.parse(saved) : initForm(defs)
    } catch { return initForm(defs) }
  })
  const textareaRef = useRef(null)

  useEffect(() => { localStorage.setItem(`pe_${faseId}_mode`, mode) }, [mode, faseId])
  useEffect(() => { localStorage.setItem(`pe_${faseId}_raw`,  raw)  }, [raw,  faseId])
  useEffect(() => {
    localStorage.setItem(`pe_${faseId}_form`, JSON.stringify(formValues))
  }, [formValues, faseId])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [raw, mode])

  // Sincroniza hacia arriba cuando cambia el modo o los valores
  useEffect(() => {
    if (mode === 'json') {
      try {
        const parsed = JSON.parse(raw)
        setRawError(null)
        onChange(parsed)
      } catch {
        setRawError('JSON inválido')
        onChange(null)
      }
    } else {
      onChange(formToParams(formValues, defs))
    }
  }, [mode, raw, formValues])

  function switchToForm() {
    try {
      const parsed = JSON.parse(raw)
      setFormValues(paramsToForm(parsed, defs))
      setRawError(null)
    } catch {
      // Si el JSON era inválido, dejamos el formulario con los valores actuales
    }
    setMode('form')
  }

  function switchToJson() {
    const params = formToParams(formValues, defs)
    const hasValues = Object.keys(params).length > 0
    if (hasValues) {
      setRaw(JSON.stringify(params, null, 2))
    } else if (suggestions && Object.keys(suggestions).length > 0) {
      setRaw(JSON.stringify(suggestions, null, 2))
    } else {
      setRaw(generateTemplate(defs))
    }
    setMode('json')
  }

  function setField(id, value) {
    setFormValues(prev => ({ ...prev, [id]: value }))
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {/* Cabecera con toggle */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-600 dark:text-gray-500">Parámetros</label>
        <button
          type="button"
          onClick={() => mode === 'form' ? switchToJson() : switchToForm()}
          className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-700 hover:text-gray-900 hover:border-gray-500 transition-colors font-mono dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title={mode === 'form' ? 'Cambiar a JSON libre' : 'Cambiar a formulario'}
        >
          {mode === 'form' ? '㊂' : '🝚'}
        </button>
      </div>

      {mode === 'json' ? (
        <>
          <textarea
            ref={textareaRef}
            className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-900 font-mono resize-none overflow-hidden focus:outline-none focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            style={{ minHeight: '80px' }}
            value={raw}
            onChange={e => setRaw(e.target.value)}
          />
          {rawError && <span className="text-red-400 text-xs">{rawError}</span>}
        </>
      ) : (
        <div
          className="bg-gray-100 border border-gray-300 rounded p-2 overflow-y-auto dark:bg-gray-800 dark:border-gray-700"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '6px', maxHeight: '12rem' }}
        >
          {defs.length === 0 ? (
            <p className="text-xs text-gray-600 dark:text-gray-500 italic">Sin parámetros definidos</p>
          ) : (
            defs.map(def => (
              <ParamField
                key={def.id}
                def={def}
                value={formValues[def.id] ?? ''}
                suggestion={suggestions[def.id]}
                onChange={v => setField(def.id, v)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ParamField({ def, value, suggestion, onChange }) {
  const base = 'w-full bg-white border rounded px-2 py-0.5 text-xs text-gray-900 focus:outline-none focus:border-indigo-500 dark:bg-gray-900 dark:text-gray-100'
  const borderColor = def.required
    ? 'border-gray-500 dark:border-gray-600'
    : 'border-gray-300 dark:border-gray-700'

  const ph = suggestion !== undefined && suggestion !== null && suggestion !== ''
    ? String(typeof suggestion === 'object' ? JSON.stringify(suggestion) : suggestion)
    : (def.hint ?? '')

  return (
    <div className="flex items-center gap-2 min-w-0">
      <label className="w-32 shrink-0 text-xs truncate" title={def.label}>
        <span
          className={
            def.inherited
              ? 'text-gray-500 dark:text-gray-500 italic'
              : def.required
                ? 'text-gray-700 dark:text-gray-300'
                : 'text-gray-500 dark:text-gray-500'
          }
        >
          {def.label}
        </span>
        {def.required && <span className="text-indigo-400 ml-0.5">*</span>}
      </label>

      {def.type === 'select' ? (
        <select
          className={`${base} ${borderColor} flex-1`}
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {!def.required && <option value="">—</option>}
          {def.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : def.type === 'boolean' ? (
        <input
          type="checkbox"
          className="accent-indigo-500"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
        />
      ) : def.type === 'json' ? (
        <input
          className={`${base} ${borderColor} flex-1 font-mono`}
          placeholder={ph}
          value={typeof value === 'object' ? JSON.stringify(value) : value}
          onChange={e => onChange(e.target.value)}
          title={ph}
        />
      ) : def.type === 'integer' ? (
        <input
          type="number"
          step="1"
          className={`${base} ${borderColor} flex-1`}
          placeholder={ph || '0'}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : def.type === 'float' ? (
        <input
          type="number"
          step="any"
          className={`${base} ${borderColor} flex-1`}
          placeholder={ph || '0.0'}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className={`${base} ${borderColor} flex-1`}
          placeholder={ph}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateTemplate(defs) {
  const template = {}
  for (const def of defs) {
    if (def.type === 'integer' || def.type === 'float') template[def.id] = null
    else if (def.type === 'boolean')                    template[def.id] = false
    else if (def.type === 'select')                     template[def.id] = def.options?.[0] ?? ''
    else if (def.type === 'json') {
      try { template[def.id] = def.hint ? JSON.parse(def.hint) : null }
      catch { template[def.id] = null }
    } else {
      template[def.id] = ''
    }
  }
  return JSON.stringify(template, null, 2)
}

function initForm(defs) {
  return Object.fromEntries(defs.map(d => [d.id, '']))
}

function paramsToForm(params, defs) {
  const form = initForm(defs)
  for (const def of defs) {
    if (params[def.id] !== undefined) {
      const v = params[def.id]
      form[def.id] = (def.type === 'json') ? JSON.stringify(v) : String(v ?? '')
    }
  }
  return form
}

function formToParams(values, defs) {
  const params = {}
  for (const def of defs) {
    const raw = values[def.id]
    if (raw === '' || raw === undefined || raw === null) continue

    if (def.type === 'integer')      params[def.id] = parseInt(raw, 10)
    else if (def.type === 'float')   params[def.id] = parseFloat(raw)
    else if (def.type === 'boolean') params[def.id] = Boolean(raw)
    else if (def.type === 'json') {
      try { params[def.id] = JSON.parse(raw) } catch { params[def.id] = raw }
    } else {
      params[def.id] = raw
    }
  }
  return params
}
