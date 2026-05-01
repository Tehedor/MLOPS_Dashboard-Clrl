import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPhases, getTableConfig, getRows,
  pullVariant, deleteVariant, syncVariants, getJob, getSyncInterval,
} from '../api/variants'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

function LocalCell({ row, phase, onAction }) {
  const local = row._local || {}
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const pollRef = useRef(null)

  const startPoll = useCallback((id) => {
    setJobId(id)
    pollRef.current = setInterval(async () => {
      const job = await getJob(id)
      setJobStatus(job.status)
      if (job.status === 'done' || job.status === 'failed') {
        clearInterval(pollRef.current)
        onAction()
        if (job.status === 'failed') {
          alert(`Error: ${job.error || 'unknown'}`)
        }
      }
    }, 1500)
  }, [onAction])

  useEffect(() => () => clearInterval(pollRef.current), [])

  const busy = jobStatus === 'queued' || jobStatus === 'running'

  const handlePull = async () => {
    const res = await pullVariant(phase, row.variant)
    startPoll(res.job_id)
  }

  const handleDelete = async () => {
    setShowConfirm(false)
    const res = await deleteVariant(phase, row.variant)
    startPoll(res.job_id)
  }

  const statusLabel = {
    local: `Local (${fmtBytes(local.size_bytes)})`,
    partial: `Parcial (${local.files_present}/${local.files_expected})`,
    not_local: 'No local',
    error: 'Error',
  }[local.status] || local.status

  const statusColor = {
    local: 'text-green-600 dark:text-green-400',
    partial: 'text-yellow-600 dark:text-yellow-400',
    not_local: 'text-gray-400',
    error: 'text-red-500',
  }[local.status] || ''

  return (
    <div className="flex items-center gap-1.5 min-w-[160px]">
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-5 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm mb-4 text-gray-900 dark:text-gray-100">
              ¿Eliminar artefactos locales de <strong>{row.variant}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <span className={`text-xs ${statusColor} flex-1`}>
        {busy ? (
          <span className="flex items-center gap-1">
            <Spinner />
            {jobStatus === 'queued' ? 'En cola…' : jobStatus === 'running' ? 'Procesando…' : statusLabel}
          </span>
        ) : statusLabel}
      </span>

      {!busy && local.status !== 'local' && (
        <button
          onClick={handlePull}
          title="Descargar"
          className="px-1.5 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 shrink-0"
        >
          ↓
        </button>
      )}
      {!busy && (local.status === 'local' || local.status === 'partial') && (
        <button
          onClick={() => setShowConfirm(true)}
          title="Eliminar artefactos locales"
          className="px-1.5 py-0.5 text-xs rounded bg-red-500 text-white hover:bg-red-600 shrink-0"
        >
          ✕
        </button>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-3 w-3 inline" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

// ── Column config ─────────────────────────────────────────────────────────────

function buildColumnDefs(phaseCfg) {
  if (!phaseCfg) return []
  const baseCols = (phaseCfg.base_columns || []).map(bc => ({
    key: bc.id, id: bc.id, label: bc.label || bc.id, color: bc.color, isBase: true,
  }))
  const sources = phaseCfg.sources || phaseCfg.source || []
  // Count id occurrences across all sources to detect duplicates
  const idCount = {}
  for (const src of sources)
    for (const col of src.columns || [])
      idCount[col.id] = (idCount[col.id] || 0) + 1

  const sourceCols = []
  for (const src of sources) {
    const fileStem = (src.file || '').replace(/\.[^.]+$/, '')
    for (const col of src.columns || []) {
      const key = idCount[col.id] > 1 ? `${fileStem}__${col.id}` : col.id
      sourceCols.push({ key, id: col.id, label: col.label || col.id, color: col.color || src.color })
    }
  }
  return [...baseCols, ...sourceCols]
}

function ColVisibilityMenu({ cols, visible, onChange, onReset }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        Columnas ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-3 w-[360px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Columnas visibles</span>
            <button
              onClick={onReset}
              className="text-xs text-blue-500 hover:underline"
            >
              Mostrar todas
            </button>
          </div>
          <div className="overflow-y-auto max-h-64 grid grid-cols-2 gap-x-4 gap-y-0.5">
            {cols.map(col => (
              <label key={col.key} className="flex items-center gap-1.5 py-0.5 cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={visible.has(col.key)}
                  onChange={e => {
                    const next = new Set(visible)
                    e.target.checked ? next.add(col.key) : next.delete(col.key)
                    onChange(next)
                  }}
                  className="shrink-0"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bulk action bar ───────────────────────────────────────────────────────────

function BulkActionBar({ selected, rows, onPull, onDelete, onClear, progress }) {
  const pullable = rows.filter(r => selected.has(r.variant) && r._local?.status !== 'local').length
  const deletable = rows.filter(r => selected.has(r.variant) && (r._local?.status === 'local' || r._local?.status === 'partial')).length
  const busy = !!progress

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800 text-xs shrink-0">
      <span className="font-medium text-indigo-700 dark:text-indigo-300">
        {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
      </span>

      {progress ? (
        <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
          <Spinner />
          {progress.type === 'pull' ? 'Descargando' : 'Eliminando'} {progress.done}/{progress.total}…
        </span>
      ) : (
        <>
          <button
            onClick={onPull}
            disabled={pullable === 0 || busy}
            title={pullable === 0 ? 'Ninguna seleccionada está fuera de local' : undefined}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↓ Descargar {pullable > 0 && `(${pullable})`}
          </button>
          <button
            onClick={onDelete}
            disabled={deletable === 0 || busy}
            title={deletable === 0 ? 'Ninguna seleccionada tiene datos locales' : undefined}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✕ Eliminar {deletable > 0 && `(${deletable})`}
          </button>
        </>
      )}

      <button onClick={onClear} className="ml-auto text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300">
        Limpiar selección ✕
      </button>
    </div>
  )
}

// ── Phase table ───────────────────────────────────────────────────────────────

const LS_KEY = (phase) => `variants_hidden_cols_${phase}`

function PhaseTable({ phase, refetchIntervalMs = 60_000 }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState('variant')
  const [sortDir, setSortDir] = useState('asc')
  const [offset, setOffset] = useState(0)
  const [colFilters, setColFilters] = useState({})
  const [debouncedFilters, setDebouncedFilters] = useState({})
  const [openFilters, setOpenFilters] = useState(new Set())

  const [selected, setSelected]         = useState(new Set())
  const [bulkConfirm, setBulkConfirm]   = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const bulkPollRef = useRef(null)
  useEffect(() => () => clearInterval(bulkPollRef.current), [])
  const LIMIT = 50

  // Debounce column filters 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilters(colFilters), 300)
    return () => clearTimeout(t)
  }, [colFilters])

  const { data: phaseCfg, isError: cfgError } = useQuery({
    queryKey: ['variant-cfg', phase],
    queryFn: () => getTableConfig(phase),
    retry: false,
  })

  const colDefs = buildColumnDefs(phaseCfg)
  const sourceCols = colDefs.filter(c => !c.isBase)

  const [hiddenCols, setHiddenCols] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_KEY(phase))
      if (saved) return new Set(JSON.parse(saved))
    } catch {}
    return new Set()
  })

  useEffect(() => {
    localStorage.setItem(LS_KEY(phase), JSON.stringify([...hiddenCols]))
  }, [hiddenCols, phase])

  const { data, isLoading } = useQuery({
    queryKey: ['variant-rows', phase, q, sortBy, sortDir, offset, debouncedFilters],
    queryFn: () => getRows({ phase, limit: LIMIT, offset, q, sort_by: sortBy, sort_dir: sortDir, col_filters: debouncedFilters }),
    keepPreviousData: true,
    refetchInterval: refetchIntervalMs,
  })

  const syncMut = useMutation({
    mutationFn: () => syncVariants(phase),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variant-rows', phase] }),
  })

  const refreshRows = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['variant-rows', phase] })
  }, [qc, phase])

  const setFilter = useCallback((key, value) => {
    setColFilters(prev => {
      const next = { ...prev }
      if (value) next[key] = value
      else delete next[key]
      return next
    })
    setOffset(0)
  }, [])

  const toggleFilter = useCallback((key) => {
    setOpenFilters(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        setFilter(key, '')
      } else {
        next.add(key)
      }
      return next
    })
  }, [setFilter])

  // A filter is visible if explicitly opened OR if it has an active value
  const isFilterVisible = (key) => openFilters.has(key) || !!colFilters[key]

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  // ── Selection helpers ───────────────────────────────────────────────────────

  function toggleRow(variant) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(variant) ? next.delete(variant) : next.add(variant)
      return next
    })
  }

  function togglePageAll() {
    const pageRows = data?.rows || []
    const allChecked = pageRows.length > 0 && pageRows.every(r => selected.has(r.variant))
    setSelected(prev => {
      const next = new Set(prev)
      pageRows.forEach(r => allChecked ? next.delete(r.variant) : next.add(r.variant))
      return next
    })
  }

  // ── Bulk operations ─────────────────────────────────────────────────────────

  async function handleBulkPull() {
    const targets = (data?.rows || []).filter(r => selected.has(r.variant) && r._local?.status !== 'local')
    if (!targets.length) return
    setBulkProgress({ done: 0, total: targets.length, type: 'pull' })
    const jobMap = new Map()
    await Promise.all(targets.map(async row => {
      try {
        const { job_id } = await pullVariant(phase, row.variant)
        jobMap.set(row.variant, job_id)
      } catch {
        jobMap.delete(row.variant)
        setBulkProgress(p => p && { ...p, done: p.done + 1 })
      }
    }))
    clearInterval(bulkPollRef.current)
    bulkPollRef.current = setInterval(async () => {
      if (!jobMap.size) { _finishBulk(); return }
      for (const [variant, jobId] of [...jobMap]) {
        const job = await getJob(jobId)
        if (job.status === 'done' || job.status === 'failed') jobMap.delete(variant)
      }
      setBulkProgress(p => p && { ...p, done: targets.length - jobMap.size })
      if (!jobMap.size) _finishBulk()
    }, 1500)
  }

  async function handleBulkDeleteConfirmed() {
    setBulkConfirm(false)
    const targets = (data?.rows || []).filter(r => selected.has(r.variant) && (r._local?.status === 'local' || r._local?.status === 'partial'))
    if (!targets.length) return
    setBulkProgress({ done: 0, total: targets.length, type: 'delete' })
    const jobMap = new Map()
    await Promise.all(targets.map(async row => {
      try {
        const { job_id } = await deleteVariant(phase, row.variant)
        jobMap.set(row.variant, job_id)
      } catch {
        setBulkProgress(p => p && { ...p, done: p.done + 1 })
      }
    }))
    clearInterval(bulkPollRef.current)
    bulkPollRef.current = setInterval(async () => {
      if (!jobMap.size) { _finishBulk(); return }
      for (const [variant, jobId] of [...jobMap]) {
        const job = await getJob(jobId)
        if (job.status === 'done' || job.status === 'failed') jobMap.delete(variant)
      }
      setBulkProgress(p => p && { ...p, done: targets.length - jobMap.size })
      if (!jobMap.size) _finishBulk()
    }, 1500)
  }

  function _finishBulk() {
    clearInterval(bulkPollRef.current)
    refreshRows()
    setBulkProgress(null)
    setSelected(new Set())
  }

  // ────────────────────────────────────────────────────────────────────────────

  if (cfgError) {
    return (
      <div className="p-4 text-sm text-yellow-600 dark:text-yellow-400">
        Configuración de fase no definida en table_config.yaml
      </div>
    )
  }

  // Base columns always visible; source columns filtered by user selection
  const cols = colDefs.filter(c => c.isBase || !hiddenCols.has(c.key))
  const rows = data?.rows || []
  const total = data?.total || 0
  const pages = Math.ceil(total / LIMIT)
  const page = Math.floor(offset / LIMIT)

  const pageRows = rows
  const allPageSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.variant))
  const somePageSelected = !allPageSelected && pageRows.some(r => selected.has(r.variant))

  return (
    <div className="flex flex-col h-full">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <BulkActionBar
          selected={selected}
          rows={pageRows}
          onPull={handleBulkPull}
          onDelete={() => setBulkConfirm(true)}
          onClear={() => setSelected(new Set())}
          progress={bulkProgress}
        />
      )}

      {/* Bulk delete confirm modal */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-5 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm mb-4 text-gray-900 dark:text-gray-100">
              ¿Eliminar artefactos locales de{' '}
              <strong>
                {pageRows.filter(r => selected.has(r.variant) && (r._local?.status === 'local' || r._local?.status === 'partial')).length}
              </strong>{' '}
              variante(s)?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkConfirm(false)}
                className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDeleteConfirmed}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOffset(0) }}
          placeholder="Buscar variante…"
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 w-44"
        />
        <span className="text-xs text-gray-400 flex-1">{total} variantes</span>
        <button
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {syncMut.isPending ? <Spinner /> : '↻'} Sync
        </button>
        {sourceCols.length > 0 && (
          <ColVisibilityMenu
            cols={sourceCols}
            visible={new Set(sourceCols.map(c => c.key).filter(k => !hiddenCols.has(k)))}
            onChange={(newVisible) => {
              const allSourceKeys = new Set(sourceCols.map(c => c.key))
              setHiddenCols(new Set([...allSourceKeys].filter(k => !newVisible.has(k))))
            }}
            onReset={() => setHiddenCols(new Set())}
          />
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-sm text-gray-400">
            <Spinner /> <span className="ml-2">Cargando…</span>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-900 z-10">
              <tr>
                {cols.map(col => (
                  <th
                    key={col.key}
                    style={col.color ? { backgroundColor: col.color + '70', borderTop: `2px solid ${col.color}` } : { backgroundColor: 'rgb(209 213 219)' }}
                    className="px-2 py-1.5 text-left font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap border-b-2 border-gray-300 dark:border-gray-600 select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span
                        onClick={() => handleSort(col.key)}
                        className="cursor-pointer hover:opacity-70 flex items-center gap-0.5"
                      >
                        {col.label}
                        <span className={`text-[10px] ${sortBy === col.key ? 'text-gray-700' : 'text-gray-400'}`}>
                          {sortBy === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); toggleFilter(col.key) }}
                        title="Filtrar"
                        className={`shrink-0 rounded p-0.5 transition-colors ${isFilterVisible(col.key) ? 'text-blue-600' : 'text-gray-400 hover:text-gray-700'}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {isFilterVisible(col.key) && (
                        <input
                          autoFocus
                          value={colFilters[col.key] || ''}
                          onChange={e => setFilter(col.key, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => { if (e.key === 'Escape') toggleFilter(col.key) }}
                          placeholder="…"
                          className="w-20 text-[10px] font-normal px-1.5 py-0.5 rounded border border-black/25 bg-white/80 dark:bg-black/30 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                      {colFilters[col.key] && (
                        <button
                          onClick={e => { e.stopPropagation(); setFilter(col.key, '') }}
                          className="text-[11px] text-blue-600 font-bold leading-none hover:text-red-500"
                          title="Borrar filtro"
                        >×</button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-left font-semibold text-gray-800 dark:text-gray-100 border-b-2 border-gray-300 dark:border-gray-600 whitespace-nowrap" style={{ backgroundColor: 'rgb(209 213 219)' }}>
                  Local
                </th>
                <th className="px-2 py-1.5 w-8 border-b-2 border-gray-300 dark:border-gray-600" style={{ backgroundColor: 'rgb(209 213 219)' }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={el => { if (el) el.indeterminate = somePageSelected }}
                    onChange={togglePageAll}
                    className="cursor-pointer"
                    title="Seleccionar página"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.variant}
                  className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    selected.has(row.variant) ? 'bg-indigo-50 dark:bg-indigo-950/20' :
                    row._parse_error ? 'bg-red-50 dark:bg-red-950/20' : ''
                  }`}
                >
                  {cols.map(col => (
                    <td key={col.key} style={col.color ? { backgroundColor: col.color + '18' } : {}} className="px-2 py-1 text-gray-800 dark:text-gray-200 whitespace-nowrap max-w-[200px] truncate">
                      {row._parse_error && col.key === 'variant' ? (
                        <span title={row._parse_error} className="text-red-500 cursor-help">
                          ⚠ {row[col.key]}
                        </span>
                      ) : (
                        Array.isArray(row[col.key])
                          ? row[col.key].join(', ')
                          : row[col.key] != null ? String(row[col.key]) : ''
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <LocalCell row={row} phase={phase} onAction={refreshRows} />
                  </td>
                  <td className="px-2 py-1 w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(row.variant)}
                      onChange={() => toggleRow(row.variant)}
                      className="cursor-pointer"
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 1} className="px-2 py-6 text-center text-gray-400">
                    Sin datos. Pulsa Sync para indexar las variantes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-500 shrink-0">
          <button disabled={page === 0} onClick={() => setOffset(0)} className="disabled:opacity-30">«</button>
          <button disabled={page === 0} onClick={() => setOffset((page - 1) * LIMIT)} className="disabled:opacity-30">‹</button>
          <span>Pág {page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setOffset((page + 1) * LIMIT)} className="disabled:opacity-30">›</button>
          <button disabled={page >= pages - 1} onClick={() => setOffset((pages - 1) * LIMIT)} className="disabled:opacity-30">»</button>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Variants() {
  const { data: intervals = {} } = useQuery({
    queryKey: ['sync-interval'],
    queryFn: getSyncInterval,
    staleTime: Infinity,
  })
  const tableRefreshMs = (intervals.table_refresh_seconds ?? 15) * 1000

  const { data: phases = [], isLoading } = useQuery({
    queryKey: ['variant-phases'],
    queryFn: getPhases,
    refetchInterval: tableRefreshMs,
  })

  const [activePhase, setActivePhase] = useState(null)

  useEffect(() => {
    if (phases.length && !activePhase) setActivePhase(phases[0])
  }, [phases])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        <Spinner /> <span className="ml-2">Cargando fases…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Phase tabs */}
      <div className="flex items-center gap-0.5 px-3 pt-2 border-b border-gray-200 dark:border-gray-800 shrink-0 overflow-x-auto">
        {phases.map(phase => (
          <button
            key={phase}
            onClick={() => setActivePhase(phase)}
            className={`px-3 py-1.5 text-xs rounded-t font-medium whitespace-nowrap transition-colors ${
              activePhase === phase
                ? 'bg-white dark:bg-gray-900 border border-b-white dark:border-gray-700 dark:border-b-gray-900 text-gray-900 dark:text-gray-100 -mb-px'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {phase}
          </button>
        ))}
      </div>

      {/* Table area — min-h-0 prevents flex child from growing beyond bounds
          without clipping absolutely-positioned overlays (the column menu) */}
      <div className="flex-1 min-h-0">
        {activePhase ? (
          <PhaseTable key={activePhase} phase={activePhase} refetchIntervalMs={tableRefreshMs} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            Selecciona una fase
          </div>
        )}
      </div>
    </div>
  )
}
