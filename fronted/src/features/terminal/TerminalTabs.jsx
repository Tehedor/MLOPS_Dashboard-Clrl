import { useRef, useEffect, useState } from 'react'

const STATUS_DOT = {
  connecting: 'bg-yellow-400 animate-pulse',
  connected: 'bg-green-500',
  disconnected: 'bg-gray-400',
  error: 'bg-red-500',
}

function TabBar({ sessions, activeId, onTabChange, onTabClose, onNewTab, runners, paneId, onDropSession }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  function handleDragOver(e) {
    if (!e.dataTransfer.types.includes('text/x-pane')) return
    e.preventDefault()
    setDragOver(true)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const sessionId = e.dataTransfer.getData('text/x-session-id')
    const srcPaneId = e.dataTransfer.getData('text/x-pane')
    if (sessionId && srcPaneId !== String(paneId)) onDropSession?.(sessionId, paneId)
  }

  return (
    <div
      className={`flex items-center border-b shrink-0 min-h-[36px] transition-colors ${
        dragOver
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Scrollable tabs */}
      <div className="flex items-center flex-1 overflow-x-auto min-w-0">
        {sessions.map(s => (
          <button
            key={s.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/x-session-id', s.id)
              e.dataTransfer.setData('text/x-pane', String(paneId))
            }}
            onClick={() => onTabChange(s.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border-r border-gray-200 dark:border-gray-800 shrink-0 transition-colors whitespace-nowrap cursor-grab active:cursor-grabbing ${
              s.id === activeId
                ? 'bg-white dark:bg-gray-950 text-gray-900 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[s.status] ?? STATUS_DOT.disconnected}`} />
            <span>{s.label}</span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onTabClose(s.id) }}
              className="ml-1 opacity-50 hover:opacity-100 transition-opacity leading-none"
            >
              ×
            </span>
          </button>
        ))}
      </div>

      {/* + button — outside scroll so dropdown isn't clipped */}
      <div className="relative shrink-0 px-1">
        <button
          onClick={() => setPickerOpen(o => !o)}
          title="Nueva sesión"
          className={`w-7 h-7 flex items-center justify-center text-lg font-medium rounded border transition-colors ${
            pickerOpen
              ? 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 dark:hover:border-gray-500'
          }`}
        >
          +
        </button>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-md border shadow-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
              <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-gray-400 uppercase tracking-wide">Abrir sesión en</p>
              {runners.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">Sin runners disponibles</p>
              )}
              {runners.map(r => (
                <button
                  key={r.id}
                  onClick={() => { onNewTab(r.id); setPickerOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ActionBar({ session, onClear, onCtrlC, onReconnect }) {
  if (!session) return null
  return (
    <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-3 py-1 flex items-center gap-2 bg-gray-50 dark:bg-gray-900">
      <button
        onClick={onClear}
        className="text-xs px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300"
      >
        Clear
      </button>
      <button
        onClick={onCtrlC}
        className="text-xs px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300"
      >
        Ctrl+C
      </button>
      <button
        onClick={onReconnect}
        className="text-xs px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300"
      >
        Reconectar
      </button>
      <div className="flex-1" />
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {session.label}
        <span className={`ml-2 ${session.status === 'error' ? 'text-red-400' : ''}`}>
          {session.status}
        </span>
      </span>
    </div>
  )
}

// Panes are rendered at Vista4 level — this component only manages chrome.
// onCellRef: callback(domNode | null) for the content area node.
// getActivePaneRef: () => React.RefObject for the active pane's imperative handle.
export default function TerminalTabs({
  sessions, activeId, onTabChange, onTabClose, onNewTab,
  onSessionStatus, runners, paneId, onDropSession,
  onCellRef, getActivePaneRef,
}) {
  const contentRef = useRef(null)

  useEffect(() => {
    onCellRef?.(contentRef.current)
    return () => onCellRef?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeSession = sessions.find(s => s.id === activeId)

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <TabBar
        sessions={sessions}
        activeId={activeId}
        onTabChange={onTabChange}
        onTabClose={onTabClose}
        onNewTab={onNewTab}
        runners={runners}
        paneId={paneId}
        onDropSession={onDropSession}
      />

      {/* Content placeholder — TerminalPanes are overlaid here by the vault in Vista4 */}
      <div ref={contentRef} className="flex-1 relative min-h-0 bg-[#0d1117]">
        {sessions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            Abre una sesión con + o haz clic en "Conectar" en el sidebar
          </div>
        )}
      </div>

      <ActionBar
        session={activeSession}
        onClear={() => getActivePaneRef?.()?.current?.clear()}
        onCtrlC={() => getActivePaneRef?.()?.current?.ctrlc()}
        onReconnect={() => getActivePaneRef?.()?.current?.reconnect()}
      />
    </div>
  )
}
