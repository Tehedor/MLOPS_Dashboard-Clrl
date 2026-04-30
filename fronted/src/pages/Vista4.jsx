import { useState, useCallback, useMemo, useRef, useEffect, createRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRunners } from '../api/terminal'
import RunnerSidebar from '../features/terminal/RunnerSidebar'
import TerminalTabs from '../features/terminal/TerminalTabs'
import TerminalPane from '../features/terminal/TerminalPane'

function cellKey(col, row) { return `${col}-${row}` }

export default function Vista4() {
  const [colCount, setColCount] = useState(1)
  const [rowSplits, setRowSplits] = useState({ 0: false, 1: false, 2: false })
  const [sessions, setSessions] = useState([])
  const [activeIds, setActiveIds] = useState({})
  const [panePositions, setPanePositions] = useState({}) // sessionId -> {top,left,width,height}

  const paneRefs = useRef({})        // sessionId -> createRef()
  const cellContentRefs = useRef({}) // cellKey   -> DOM node
  const paneVaultRef = useRef(null)

  const { data: runners = [] } = useQuery({
    queryKey: ['runners'],
    queryFn: getRunners,
    refetchInterval: 5000,
    retry: 2,
  })

  const activeSessions = useMemo(() => {
    const counts = {}
    sessions.forEach(s => {
      if (s.status === 'connected' || s.status === 'connecting') {
        counts[s.runnerId] = (counts[s.runnerId] ?? 0) + 1
      }
    })
    return counts
  }, [sessions])

  function getPaneRef(id) {
    if (!paneRefs.current[id]) paneRefs.current[id] = createRef()
    return paneRefs.current[id]
  }

  // Stable callback — each TerminalTabs cell registers its content area DOM node.
  const setCellContentRef = useCallback((col, row, node) => {
    const key = cellKey(col, row)
    if (node) cellContentRefs.current[key] = node
    else delete cellContentRefs.current[key]
  }, [])

  // Recompute pane positions whenever sessions or layout changes.
  // Children's useEffects (onCellRef) run before parent's, so cellContentRefs is up to date.
  useEffect(() => {
    const update = () => {
      const vault = paneVaultRef.current
      if (!vault) return
      const vr = vault.getBoundingClientRect()
      const next = {}
      sessions.forEach(s => {
        const node = cellContentRefs.current[cellKey(s.col, s.row)]
        if (!node) return
        const r = node.getBoundingClientRect()
        next[s.id] = {
          top: Math.round(r.top - vr.top),
          left: Math.round(r.left - vr.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }
      })
      setPanePositions(next)
    }

    const ro = new ResizeObserver(update)
    Object.values(cellContentRefs.current).forEach(n => n && ro.observe(n))
    update()
    return () => ro.disconnect()
  }, [sessions, colCount, rowSplits])

  const openSession = useCallback((runnerId, col = 0, row = 0) => {
    const key = cellKey(col, row)
    const inCell = sessions.filter(s => s.col === col && s.row === row && s.runnerId === runnerId).length
    const label = inCell === 0 ? runnerId : `${runnerId} #${inCell + 1}`
    const id = crypto.randomUUID()
    setSessions(prev => [...prev, { id, runnerId, label, col, row, status: 'connecting' }])
    setActiveIds(prev => ({ ...prev, [key]: id }))
  }, [sessions])

  const closeSession = useCallback((id) => {
    delete paneRefs.current[id]
    setSessions(prev => {
      const session = prev.find(s => s.id === id)
      if (!session) return prev
      const key = cellKey(session.col, session.row)
      const remaining = prev.filter(s => s.col === session.col && s.row === session.row && s.id !== id)
      const fallback = remaining[remaining.length - 1]?.id ?? null
      setActiveIds(a => ({ ...a, [key]: fallback }))
      return prev.filter(s => s.id !== id)
    })
  }, [])

  const updateStatus = useCallback((id, status) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }, [])

  const moveSession = useCallback((sessionId, targetCol, targetRow) => {
    setSessions(prev => {
      const session = prev.find(s => s.id === sessionId)
      if (!session) return prev
      const oldKey = cellKey(session.col, session.row)
      const newKey = cellKey(targetCol, targetRow)
      const oldRemaining = prev.filter(s => s.col === session.col && s.row === session.row && s.id !== sessionId)
      const oldFallback = oldRemaining[oldRemaining.length - 1]?.id ?? null
      setActiveIds(a => ({
        ...a,
        [oldKey]: a[oldKey] === sessionId ? oldFallback : a[oldKey],
        [newKey]: sessionId,
      }))
      return prev.map(s => s.id === sessionId ? { ...s, col: targetCol, row: targetRow } : s)
    })
  }, [])

  const addCol = useCallback(() => setColCount(c => Math.min(c + 1, 3)), [])

  const removeCol = useCallback((col) => {
    setSessions(prev => {
      const moved = prev.filter(s => s.col === col)
      if (moved.length > 0) {
        setActiveIds(a => ({ ...a, '0-0': moved[moved.length - 1].id }))
      }
      return prev.map(s => {
        if (s.col === col) return { ...s, col: 0, row: 0 }
        if (s.col > col) return { ...s, col: s.col - 1 }
        return s
      })
    })
    setRowSplits(prev => {
      const next = { ...prev }
      for (let i = col; i < 2; i++) next[i] = next[i + 1] ?? false
      next[2] = false
      return next
    })
    setColCount(c => c - 1)
  }, [])

  const toggleRowSplit = useCallback((col) => {
    setRowSplits(prev => {
      if (prev[col]) {
        setSessions(s => s.map(session =>
          session.col === col && session.row === 1 ? { ...session, row: 0 } : session
        ))
      }
      return { ...prev, [col]: !prev[col] }
    })
  }, [])

  return (
    <div className="flex h-full min-h-0">
      <RunnerSidebar
        activeSessions={activeSessions}
        onConnect={(runnerId) => openSession(runnerId, 0, 0)}
      />

      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        {/* Toolbar */}
        <div className="shrink-0 flex items-center justify-end px-3 py-1 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 gap-2">
          {colCount < 3 && (
            <button
              onClick={addCol}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
            >
              + Columna
            </button>
          )}
        </div>

        {/* Terminal grid — position:relative anchors the pane vault overlay */}
        <div className="flex flex-1 min-h-0 relative">

          {/* Chrome columns: TabBars + content placeholders + ActionBars */}
          {Array.from({ length: colCount }, (_, col) => [
            col > 0 && (
              <div key={`sep-${col}`} className="w-px bg-gray-200 dark:bg-gray-800 shrink-0" />
            ),
            <div key={`col-${col}`} className="flex flex-col flex-1 min-h-0 min-w-0">
              {/* Column controls */}
              <div className="shrink-0 flex items-center justify-end px-2 py-0.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 gap-1">
                <button
                  onClick={() => toggleRowSplit(col)}
                  title={rowSplits[col] ? 'Cerrar fila inferior' : 'Dividir arriba/abajo'}
                  className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                    rowSplits[col]
                      ? 'border-blue-400 text-blue-500 dark:text-blue-400'
                      : 'border-gray-300 dark:border-gray-700 text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  ⬒
                </button>
                {colCount > 1 && (
                  <button
                    onClick={() => removeCol(col)}
                    title="Cerrar columna"
                    className="text-xs px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-gray-400 hover:border-red-400 hover:text-red-500 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              <TerminalTabs
                key={cellKey(col, 0)}
                sessions={sessions.filter(s => s.col === col && s.row === 0)}
                activeId={activeIds[cellKey(col, 0)] ?? null}
                onTabChange={(id) => setActiveIds(prev => ({ ...prev, [cellKey(col, 0)]: id }))}
                onTabClose={closeSession}
                onNewTab={(runnerId) => openSession(runnerId, col, 0)}
                onSessionStatus={updateStatus}
                runners={runners}
                paneId={cellKey(col, 0)}
                onDropSession={(sessionId) => moveSession(sessionId, col, 0)}
                onCellRef={(node) => setCellContentRef(col, 0, node)}
                getActivePaneRef={() => paneRefs.current[activeIds[cellKey(col, 0)]]}
              />

              {rowSplits[col] && (
                <>
                  <div className="h-px bg-gray-200 dark:bg-gray-800 shrink-0" />
                  <TerminalTabs
                    key={cellKey(col, 1)}
                    sessions={sessions.filter(s => s.col === col && s.row === 1)}
                    activeId={activeIds[cellKey(col, 1)] ?? null}
                    onTabChange={(id) => setActiveIds(prev => ({ ...prev, [cellKey(col, 1)]: id }))}
                    onTabClose={closeSession}
                    onNewTab={(runnerId) => openSession(runnerId, col, 1)}
                    onSessionStatus={updateStatus}
                    runners={runners}
                    paneId={cellKey(col, 1)}
                    onDropSession={(sessionId) => moveSession(sessionId, col, 1)}
                    onCellRef={(node) => setCellContentRef(col, 1, node)}
                    getActivePaneRef={() => paneRefs.current[activeIds[cellKey(col, 1)]]}
                  />
                </>
              )}
            </div>,
          ])}

          {/* Pane vault — all TerminalPanes live here permanently.
              Positioned absolutely to overlay each cell's content area.
              pointer-events-none on the container so chrome stays clickable. */}
          <div ref={paneVaultRef} className="absolute inset-0 pointer-events-none">
            {sessions.map(s => {
              const pos = panePositions[s.id]
              const isActive = activeIds[cellKey(s.col, s.row)] === s.id
              return (
                <div
                  key={s.id}
                  className="pointer-events-auto"
                  style={
                    pos
                      ? {
                          position: 'absolute',
                          top: pos.top,
                          left: pos.left,
                          width: pos.width,
                          height: pos.height,
                          display: isActive ? 'block' : 'none',
                        }
                      : { display: 'none' }
                  }
                >
                  <TerminalPane
                    ref={getPaneRef(s.id)}
                    runnerId={s.runnerId}
                    sessionId={s.id}
                    active={isActive && !!pos}
                    onStatusChange={(status) => updateStatus(s.id, status)}
                  />
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </div>
  )
}
