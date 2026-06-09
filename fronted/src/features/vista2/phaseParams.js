export function emptyPhaseParams() {
  return {
    phase_params: {},
    phase_parent_variant: {},
  }
}

export function paramsForPhase(phaseParams, phaseId) {
  return phaseParams?.phase_params?.[phaseId] ?? []
}

export function parentVariantForPhase(phaseParams, phaseId) {
  return phaseParams?.phase_parent_variant?.[phaseId] ?? null
}
