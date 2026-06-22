import { useState, useEffect, useRef } from 'react'
import { paramsForPhase } from './phaseParams'

export default function ParamsEditor({ faseId, pipelineId, phaseParams, suggestions = {}, onChange, externalKey = 0, externalParams = null }) {
  const defs = paramsForPhase(phaseParams, faseId)
  const storageKey = `pe_${pipelineId ?? 'default'}_${faseId}_form`

  const [formValues, setFormValues] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : initForm(defs)
    } catch { return initForm(defs) }
  })
  const mounted = useRef(false)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(formValues))
  }, [formValues, storageKey])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        const next = initForm(defs)
        for (const def of defs) {
          const savedVal = parsed[def.id]
          if (savedVal === undefined) continue
          if (def.type === 'select' && def.required && savedVal === '') continue
          next[def.id] = savedVal
        }
        setFormValues(next)
        return
      }
    } catch {}
    setFormValues(initForm(defs))
  }, [storageKey, defs])

  // Aplicar preload externo cuando externalKey cambia (ignorar montaje inicial)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (!externalParams) return
    setFormValues(paramsToForm(externalParams, defs))
  }, [externalKey])

  // Sincroniza hacia arriba
  useEffect(() => {
    onChange(formToParams(formValues, defs))
  }, [formValues])

  function setField(id, value) {
    setFormValues(prev => ({ ...prev, [id]: value }))
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="text-xs text-gray-600 dark:text-gray-500">Parámetros</label>
      <div
        className="bg-gray-100 border border-gray-300 rounded p-2 overflow-y-auto dark:bg-gray-800 dark:border-gray-700"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '6px', maxHeight: '12rem' }}
      >
        {defs.length === 0 ? (
          <p className="text-xs text-gray-600 dark:text-gray-500 italic">Sin parámetros definidos</p>
        ) : (
          [...defs].sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0)).map(def => (
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
        <select
          className={`${base} ${borderColor} flex-1`}
          value={value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : ''}
          onChange={e => onChange(e.target.value === 'true')}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function initForm(defs) {
  return Object.fromEntries(defs.map(d => {
    if (d.type === 'select' && d.required && d.options?.length > 0) return [d.id, d.options[0]]
    if (d.type === 'boolean') return [d.id, false]
    return [d.id, '']
  }))
}

function paramsToForm(params, defs) {
  const form = initForm(defs)
  for (const def of defs) {
    if (params[def.id] !== undefined) {
      const v = params[def.id]
      form[def.id] = (def.type === 'json') ? JSON.stringify(v) : (def.type === 'boolean') ? (v === true || v === 'true') : String(v ?? '')
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
    else if (def.type === 'boolean') params[def.id] = (raw === true || raw === 'true')
    else if (def.type === 'json') {
      try { params[def.id] = JSON.parse(raw) } catch { params[def.id] = raw }
    } else {
      params[def.id] = raw
    }
  }
  return params
}
