function _deriveLabel(faseId) {
  // 'f01_explore' → 'F01 Explore'
  return faseId.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

export function transformPhases(rawPhases) {
  return rawPhases.map(p => ({
    id:               p.fase,
    label:            p.label ?? _deriveLabel(p.fase),
    runner:           p.runner,
    parentRequired:   p.parent_required ?? false,
    availableRunners: p.available_runners ?? [],
  }))
}
