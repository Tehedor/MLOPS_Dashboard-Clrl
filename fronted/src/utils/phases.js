const PHASE_LABELS = {
  'f01_explore': 'F01 Explore',
  'f02_events': 'F02 Events',
  'f03_windows': 'F03 Windows',
  'f04_targets': 'F04 Targets',
  'f05_modeling': 'F05 Modeling',
  'f06_quant': 'F06 Quant',
  'f07_modval': 'F07 ModVal',
  'f08_sysval': 'F08 SysVal',
}

const PHASES_NO_PARENT = new Set(['f01_explore', 'f08_sysval'])

export function transformPhases(rawPhases) {
  return rawPhases.map(p => ({
    id: p.fase,
    label: PHASE_LABELS[p.fase] || p.fase,
    runner: p.runner,
    parentRequired: !PHASES_NO_PARENT.has(p.fase),
  }))
}
