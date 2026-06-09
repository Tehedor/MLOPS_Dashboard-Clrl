import { useRef, useEffect, useState, useCallback, useMemo } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────────

const LIFECYCLE_ICONS = {
  VARIANT_CREATED:     { icon: '🇻', cls: 'created' },
  EXECUTION_RUNNING:   { icon: '⏳', cls: 'running' },
  EXECUTION_COMPLETED: { icon: '✅', cls: 'completed' },
  EXECUTION_FAILED:    { icon: '❌', cls: 'failed' },
}

function fmtDate(iso) {
  if (!iso) return null
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) }
  catch { return iso }
}

function StatusDot({ value, title }) {
  const cls = value === true ? 'true' : value === false ? 'false' : 'none'
  const icon = { true: '✓', false: '✗', none: '○' }[cls]
  return (
    <span title={`${title}: ${value}`} className={`status-dot status-dot--${cls}`}>{icon}</span>
  )
}

// ── Compact card ──────────────────────────────────────────────────────────────

function CompactCard({ node, phaseColor, highlighted, faded, onClick, onMouseEnter, onMouseLeave }) {
  const lc = LIFECYCLE_ICONS[node.lifecycle_state] ?? { icon: '•', cls: 'none' }
  return (
    <div
      data-node-id={`${node.fase}::${node.id}`}
      onClick={() => onClick(node)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`variant-card ${highlighted ? 'variant-card--highlighted' : ''} ${faded ? 'variant-card--faded' : ''}`}
      style={{ background: phaseColor.bg, borderColor: highlighted ? phaseColor.border : phaseColor.border + '99', color: phaseColor.text, cursor: 'pointer' }}
    >
      <div className="variant-card__head">
        <span className="variant-card__id">{node.id}</span>
        <div className="variant-card__badges">
          <span className={`lifecycle-badge lifecycle-badge--${lc.cls}`} title={`lifecycle: ${node.lifecycle_state ?? 'none'}`}>{lc.icon}</span>
          <StatusDot value={node.verified}   title="verified" />
          <StatusDot value={node.registered} title="registered" />
        </div>
      </div>
    </div>
  )
}

// ── Classic card (reproduces original Python HTML style) ─────────────────────

const LIFECYCLE_LABELS = {
  VARIANT_CREATED:     'Created',
  EXECUTION_RUNNING:   'Running',
  EXECUTION_COMPLETED: 'Completed',
  EXECUTION_FAILED:    'Failed',
}

function ClassicCard({ node, phaseColor, highlighted, faded, onClick, onMouseEnter, onMouseLeave }) {
  const lc    = LIFECYCLE_ICONS[node.lifecycle_state] ?? { icon: '•', cls: 'none' }
  const label = LIFECYCLE_LABELS[node.lifecycle_state] ?? (node.lifecycle_state ?? 'None')

  const verCls  = node.verified  === true ? 'true' : node.verified  === false ? 'false' : 'none'
  const regCls  = node.registered === true ? 'true' : node.registered === false ? 'false' : 'none'

  return (
    <div
      data-node-id={`${node.fase}::${node.id}`}
      onClick={() => onClick(node)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`classic-card ${highlighted ? 'classic-card--highlighted' : ''} ${faded ? 'classic-card--faded' : ''}`}
      style={{ background: phaseColor.bg, borderColor: phaseColor.border, color: phaseColor.text }}
    >
      <div className="classic-card__head">
        <div className="classic-card__id">{node.id}</div>
        <div className="classic-card__state-stack">
          <div className="classic-card__state-row">
            <span className={`classic-lc classic-lc--${lc.cls}`}>
              {lc.icon} {label}
            </span>
          </div>
          <div className="classic-card__statuses">
            <span className={`classic-badge classic-verified--${verCls}`} title={`verified: ${node.verified}`}>
              {verCls === 'true' ? '✓' : verCls === 'false' ? '✗' : 'Ｏ'}
            </span>
            <span className={`classic-badge classic-reg--${regCls}`} title={`registered: ${node.registered}`}>
              R
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Detail card ───────────────────────────────────────────────────────────────

function DetailCard({ node, phaseColor, highlighted, faded, onClick, onMouseEnter, onMouseLeave }) {
  const lc = LIFECYCLE_ICONS[node.lifecycle_state] ?? { icon: '•', cls: 'none' }
  const createdAt   = fmtDate(node.created_at)
  const updatedAt   = fmtDate(node.lifecycle_updated_at)
  return (
    <div
      data-node-id={`${node.fase}::${node.id}`}
      onClick={() => onClick(node)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`variant-card variant-card--detail ${highlighted ? 'variant-card--highlighted' : ''} ${faded ? 'variant-card--faded' : ''}`}
      style={{ background: phaseColor.bg, borderColor: highlighted ? phaseColor.border : phaseColor.border + '99', color: phaseColor.text, cursor: 'pointer' }}
    >
      {/* Head row */}
      <div className="variant-card__head">
        <span className="variant-card__id">{node.id}</span>
        <div className="variant-card__badges">
          <span className={`lifecycle-badge lifecycle-badge--${lc.cls}`} title={`lifecycle: ${node.lifecycle_state ?? 'none'}`}>{lc.icon}</span>
          <StatusDot value={node.verified}   title="verified" />
          <StatusDot value={node.registered} title="registered" />
        </div>
      </div>

      {/* Detail rows */}
      <div className="variant-card__meta">
        {createdAt && (
          <div className="variant-card__meta-row">
            <span className="variant-card__meta-label">created</span>
            <span className="variant-card__meta-value">{createdAt}</span>
          </div>
        )}
        {updatedAt && (
          <div className="variant-card__meta-row">
            <span className="variant-card__meta-label">updated</span>
            <span className="variant-card__meta-value">{updatedAt}</span>
          </div>
        )}
        {node.parents?.length > 0 && (
          <div className="variant-card__meta-row">
            <span className="variant-card__meta-label">parent{node.parents.length > 1 ? 's' : ''}</span>
            <span className="variant-card__meta-value font-mono">{node.parents.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SVG edge layer ────────────────────────────────────────────────────────────

function EdgeLayer({ edges, containerRef, highlightedFamily }) {
  const [paths, setPaths] = useState([])

  const recalc = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const cRect = container.getBoundingClientRect()
    const newPaths = []
    for (const { sourceId, targetId } of edges) {
      const src = container.querySelector(`[data-node-id="${sourceId}"]`)
      const tgt = container.querySelector(`[data-node-id="${targetId}"]`)
      if (!src || !tgt) continue
      const sRect = src.getBoundingClientRect()
      const tRect = tgt.getBoundingClientRect()
      const x1 = sRect.right  - cRect.left
      const y1 = sRect.top + sRect.height / 2 - cRect.top
      const x2 = tRect.left   - cRect.left
      const y2 = tRect.top + tRect.height / 2 - cRect.top
      const cx = (x1 + x2) / 2
      newPaths.push({ sourceId, targetId, d: `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}` })
    }
    setPaths(newPaths)
  }, [edges, containerRef])

  useEffect(() => {
    recalc()
    const ro = new ResizeObserver(recalc)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [recalc])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', recalc)
    return () => el.removeEventListener('scroll', recalc)
  }, [recalc, containerRef])

  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {paths.map(({ sourceId, targetId, d }) => {
        const isHighlighted = highlightedFamily.has(sourceId) && highlightedFamily.has(targetId)
        const isFaded = highlightedFamily.size > 0 && !isHighlighted
        return (
          <path
            key={`${sourceId}->${targetId}`}
            d={d}
            fill="none"
            stroke={isHighlighted ? '#f97316' : '#94a3b8'}
            strokeWidth={isHighlighted ? 2.5 : 1.5}
            strokeOpacity={isFaded ? 0.07 : isHighlighted ? 1 : 0.5}
          />
        )
      })}
    </svg>
  )
}

// ── Section slicer ────────────────────────────────────────────────────────────

const ALL_SECTIONS = [
  { id: 'estado',     label: 'Estado' },
  { id: 'params',     label: 'Parámetros' },
  { id: 'exports',    label: 'Exports' },
  { id: 'metrics',    label: 'Metrics' },
  { id: 'artifacts',  label: 'Artifacts' },
  { id: 'metadata',   label: 'Metadata' },
  { id: 'check_log',  label: 'Check Log' },
]

const DEFAULT_VISIBLE = new Set(['estado', 'params', 'exports', 'metrics'])

function loadVisibleSections() {
  try {
    const raw = localStorage.getItem('linaje_panel_sections')
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* ignore */ }
  return DEFAULT_VISIBLE
}

function SectionSlicer({ visible, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const toggle = (id) => {
    const next = new Set(visible)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative" style={{ flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Secciones visibles"
        className="detail-slicer-btn"
      >
        <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.54 11.54l1.41 1.41M3.05 12.95l1.42-1.42M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div className="detail-slicer-dropdown">
          <div className="detail-slicer-label">Mostrar secciones</div>
          {ALL_SECTIONS.map(s => (
            <label key={s.id} className="detail-slicer-row">
              <input
                type="checkbox"
                checked={visible.has(s.id)}
                onChange={() => toggle(s.id)}
                className="detail-slicer-check"
              />
              {s.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailSection({ title, data }) {
  if (data === null || data === undefined) return null
  if (typeof data === 'object' && Object.keys(data).length === 0) return null
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return (
    <div className="detail-panel__section">
      <div className="detail-panel__section-title">{title}</div>
      <pre className="detail-panel__pre">{content}</pre>
    </div>
  )
}

function DetailPanel({ node, onClose }) {
  const [visibleSections, setVisibleSections] = useState(loadVisibleSections)

  useEffect(() => {
    try { localStorage.setItem('linaje_panel_sections', JSON.stringify([...visibleSections])) }
    catch { /* ignore */ }
  }, [visibleSections])

  if (!node) return null

  const lc = LIFECYCLE_ICONS[node.lifecycle_state] ?? { icon: '•', cls: 'none' }

  const metaSummary = Object.fromEntries(
    Object.entries({
      lifecycle_state:      node.lifecycle_state,
      lifecycle_updated_at: node.lifecycle_updated_at,
      created_at:           node.created_at,
      verified:             node.verified,
      registered:           node.registered,
      parents:              node.parents?.length ? node.parents : undefined,
    }).filter(([, v]) => v !== undefined)
  )

  return (
    <div className="detail-panel">
      {/* Header */}
      <div className="detail-panel__header">
        <span className="detail-panel__title">{node.id}</span>
        <span className={`classic-lc classic-lc--${lc.cls} detail-panel__lc`}>
          {lc.icon} {node.lifecycle_state?.replace('EXECUTION_', '').replace('VARIANT_', '') ?? '—'}
        </span>
        <SectionSlicer visible={visibleSections} onChange={setVisibleSections} />
        <button className="detail-panel__close" onClick={onClose} title="Cerrar">✕</button>
      </div>
      <div className="detail-panel__fase">{node.fase}</div>

      {/* Sections */}
      <div className="detail-panel__sections">
        {visibleSections.has('estado')    && <DetailSection title="Estado"     data={metaSummary} />}
        {visibleSections.has('params')    && <DetailSection title="Parámetros" data={node.params} />}
        {visibleSections.has('exports')   && <DetailSection title="Exports"    data={node.outputs?.exports} />}
        {visibleSections.has('metrics')   && <DetailSection title="Metrics"    data={node.outputs?.metrics} />}
        {visibleSections.has('artifacts') && <DetailSection title="Artifacts"  data={node.outputs?.artifacts} />}
        {visibleSections.has('metadata')  && <DetailSection title="Metadata"   data={node.metadata} />}
        {visibleSections.has('check_log') && <DetailSection title="Check Log"  data={node.check_log} />}
      </div>
    </div>
  )
}

// ── Genealogy ─────────────────────────────────────────────────────────────────

function buildLineageSet(nodeKey, edges) {
  // Ancestors: traverse backward from nodeKey only
  const ancestors = new Set([nodeKey])
  let changed = true
  while (changed) {
    changed = false
    for (const { sourceId, targetId } of edges) {
      if (ancestors.has(targetId) && !ancestors.has(sourceId)) {
        ancestors.add(sourceId); changed = true
      }
    }
  }
  // Descendants: traverse forward from nodeKey only
  const descendants = new Set([nodeKey])
  changed = true
  while (changed) {
    changed = false
    for (const { sourceId, targetId } of edges) {
      if (descendants.has(sourceId) && !descendants.has(targetId)) {
        descendants.add(targetId); changed = true
      }
    }
  }
  return new Set([...ancestors, ...descendants])
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function computeVisibleKeys(filterText, dateStart, dateEnd, variants, edges) {
  const text    = filterText?.trim()
  const hasText = !!text
  const hasDate = !!(dateStart || dateEnd)
  if (!hasText && !hasDate) return null // null = show all

  // Text regex — x/X acts as digit wildcard
  let regex = null
  if (hasText) {
    const regexText = text.replace(/x/gi, '\\d')
    try { regex = new RegExp(regexText, 'i') } catch { /* fall back to contains */ }
  }

  // Date bounds — end date is inclusive through 23:59:59
  const tsStart = dateStart ? new Date(dateStart).getTime() : null
  const tsEnd   = dateEnd   ? new Date(dateEnd + 'T23:59:59.999Z').getTime() : null

  const matching = variants.filter(v => {
    if (hasText) {
      const textOk = regex ? regex.test(v.id) : v.id.toLowerCase().includes(text.toLowerCase())
      if (!textOk) return false
    }
    if (hasDate) {
      if (!v.created_at) return false
      const ts = new Date(v.created_at).getTime()
      if (tsStart && ts < tsStart) return false
      if (tsEnd   && ts > tsEnd)   return false
    }
    return true
  })

  if (matching.length === 0) return new Set()

  const visible = new Set()
  for (const v of matching) {
    for (const k of buildLineageSet(`${v.fase}::${v.id}`, edges)) visible.add(k)
  }
  return visible
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LineageGraph({ registry, phasesConfig, mode = 'compact', filterText = '', dateStart = null, dateEnd = null }) {
  const containerRef  = useRef(null)
  const [hoveredKey,   setHoveredKey]   = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)

  if (!registry?.variants?.length || !phasesConfig?.length) {
    return (
      <div className="lineage-empty">
        Sin variantes registradas. Pulsa <strong>Sync</strong> para escanear.
      </div>
    )
  }

  const variantMap = {}
  for (const v of registry.variants) variantMap[`${v.fase}::${v.id}`] = v

  const edges = []
  for (const v of registry.variants) {
    for (const parent of (v.parents ?? [])) {
      const phaseIdx = phasesConfig.findIndex(p => p.name === v.fase)
      if (phaseIdx <= 0) continue
      const parentFase = phasesConfig[phaseIdx - 1].name
      const sourceId = `${parentFase}::${parent}`
      const targetId = `${v.fase}::${v.id}`
      if (variantMap[sourceId]) edges.push({ sourceId, targetId })
    }
  }

  const highlightedFamily = hoveredKey ? buildLineageSet(hoveredKey, edges) : new Set()
  const visibleKeys       = computeVisibleKeys(filterText, dateStart, dateEnd, registry.variants, edges)
  const isFiltering       = visibleKeys !== null
  const CardComponent = mode === 'detail' ? DetailCard : mode === 'classic' ? ClassicCard : CompactCard
  const isClassic = mode === 'classic'

  return (
    <div className="lineage-graph-wrap">
      <div
        ref={containerRef}
        className={`lineage-graph ${isClassic ? 'lineage-graph--classic' : ''}`}
        style={{
          display: 'flex',
          gap: isClassic ? '40px' : mode === 'detail' ? '24px' : '28px',
          overflowX: 'auto',
          padding: isClassic ? '40px' : '24px',
          flex: 1,
          position: 'relative',
          height: '100%',
          alignItems: 'flex-start',
          boxSizing: 'border-box',
        }}
      >
        {phasesConfig.map(phase => {
          const phaseVariants = registry.variants.filter(v => v.fase === phase.name)
          const color = phase.color ?? { bg: '#fff', border: '#ccc', text: '#333' }

          if (isClassic) {
            return (
              <div
                key={phase.name}
                className="classic-column"
                style={{ borderTopColor: color.border }}
              >
                <div className="classic-column__title" style={{ color: color.text }}>
                  {phase.label ?? phase.name}
                </div>
                <div className="classic-column__cards">
                  {phaseVariants.filter(n => !isFiltering || visibleKeys.has(`${n.fase}::${n.id}`)).length === 0 ? (
                    <div className="lineage-column__empty">—</div>
                  ) : phaseVariants.map(node => {
                    const key = `${node.fase}::${node.id}`
                    if (isFiltering && !visibleKeys.has(key)) return null
                    return (
                      <ClassicCard
                        key={key}
                        node={node}
                        phaseColor={color}
                        highlighted={highlightedFamily.has(key)}
                        faded={highlightedFamily.size > 0 && !highlightedFamily.has(key)}
                        onClick={setSelectedNode}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          }

          return (
            <div key={phase.name} className="lineage-column" style={{ minWidth: mode === 'detail' ? '220px' : '175px', flexShrink: 0 }}>
              <div className="lineage-column__header" style={{ borderTopColor: color.border, color: color.text }}>
                {phase.label ?? phase.name}
              </div>
              <div className="lineage-column__cards">
                {phaseVariants.filter(n => !isFiltering || visibleKeys.has(`${n.fase}::${n.id}`)).length === 0 ? (
                  <div className="lineage-column__empty">—</div>
                ) : phaseVariants.map(node => {
                  const key = `${node.fase}::${node.id}`
                  if (isFiltering && !visibleKeys.has(key)) return null
                  return (
                    <CardComponent
                      key={key}
                      node={node}
                      phaseColor={color}
                      highlighted={highlightedFamily.has(key)}
                      faded={highlightedFamily.size > 0 && !highlightedFamily.has(key)}
                      onClick={setSelectedNode}
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() => setHoveredKey(null)}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
        <EdgeLayer edges={edges} containerRef={containerRef} highlightedFamily={highlightedFamily} />
      </div>

      {selectedNode && <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
    </div>
  )
}
