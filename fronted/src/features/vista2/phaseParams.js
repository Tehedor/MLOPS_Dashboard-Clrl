import schema from '@paramsSchema'

function paramType(def) {
  if (def.allowed) return 'select'
  switch (def.type) {
    case 'integer':           return 'integer'
    case 'float':
    case 'number':            return 'float'
    case 'boolean':           return 'boolean'
    case 'list':
    case 'dict':              return 'json'
    default:                  return 'text'   // string, file, dataset, model…
  }
}

function paramHint(def) {
  if (def.default !== undefined && def.default !== null)
    return typeof def.default === 'object' ? JSON.stringify(def.default) : String(def.default)
  if (def.type === 'list') return '[]'
  if (def.type === 'dict') return '{}'
  return undefined
}

function buildPhaseParams(phases) {
  const out = {}
  for (const [phaseId, phase] of Object.entries(phases)) {
    const params = phase.parameters ?? {}
    out[phaseId] = Object.entries(params)
      .filter(([id]) => id !== 'parent_variant')
      .filter(([, def]) => !def.inherited)
      .map(([id, def]) => {
        const entry = {
          id,
          label: id,
          type: paramType(def),
          required: def.required ?? false,
        }
        if (def.allowed)          entry.options   = def.allowed
        const hint = paramHint(def)
        if (hint !== undefined)   entry.hint      = hint
        return entry
      })
  }
  return out
}

function buildPhaseParentVariant(phases) {
  const out = {}
  for (const [phaseId, phase] of Object.entries(phases)) {
    const pv = phase.parameters?.parent_variant
    if (pv) out[phaseId] = { mode: pv.mode ?? 'single', regex: pv.regex ?? null }
  }
  return out
}

export const PHASE_PARAMS = buildPhaseParams(schema.phases)
export const PHASE_PARENT_VARIANT = buildPhaseParentVariant(schema.phases)
