import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { createTerminalWS } from '../../api/terminal'

const TerminalPane = forwardRef(function TerminalPane(
  { runnerId, sessionId, active, onStatusChange },
  ref
) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const wsRef = useRef(null)
  const statusRef = useRef('disconnected')
  const onStatusRef = useRef(onStatusChange)
  const cleanupCloseRef = useRef(false)
  const connectTimerRef = useRef(null)
  const connectionSeqRef = useRef(0)

  useEffect(() => { onStatusRef.current = onStatusChange })

  const connect = useRef(null)

  useImperativeHandle(ref, () => ({
    clear: () => termRef.current?.clear(),
    ctrlc: () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const buf = new Uint8Array([48, 3]) // INPUT opcode (ASCII '0') + Ctrl+C
        wsRef.current.send(buf.buffer)
      }
    },
    reconnect: () => connect.current?.(),
  }))

  // Mount terminal once
  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: '#388bfd33',
        black: '#484f58',
        brightBlack: '#6e7681',
      },
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, monospace',
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const encoder = new TextEncoder()

    term.onData(data => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return
      const encoded = encoder.encode(data)
      const buf = new Uint8Array(1 + encoded.length)
      buf[0] = 48 // INPUT opcode: ASCII '0'
      buf.set(encoded, 1)
      wsRef.current.send(buf.buffer)
    })

    term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return
      sendResize(wsRef.current, cols, rows)
    })

    const startConnection = () => {
      const connectionId = connectionSeqRef.current + 1
      connectionSeqRef.current = connectionId
      cleanupCloseRef.current = false
      wsRef.current?.close()

      onStatusRef.current('connecting')
      statusRef.current = 'connecting'
      term.reset()
      term.write(`\x1b[33mConectando a ${runnerId}…\x1b[0m\r\n`)

      const ws = createTerminalWS(runnerId)
      wsRef.current = ws

      ws.onopen = () => {
        if (connectionSeqRef.current !== connectionId) return
        onStatusRef.current('connected')
        statusRef.current = 'connected'
        ws.send(JSON.stringify({ AuthToken: '', columns: term.cols, rows: term.rows }))
        setTimeout(() => sendResize(ws, term.cols, term.rows), 150)
      }

      ws.onmessage = async (e) => {
        if (connectionSeqRef.current !== connectionId) return
        if (e.data instanceof Blob || e.data instanceof ArrayBuffer) {
          const buf = e.data instanceof Blob ? await e.data.arrayBuffer() : e.data
          const arr = new Uint8Array(buf)
          if (arr.length === 0) return
          if (arr[0] === 48) term.write(arr.slice(1)) // 48 = ASCII '0' = OUTPUT
          // 49='1'=title, 50='2'=prefs — ignore
        } else if (typeof e.data === 'string') {
          if (e.data[0] === '0') term.write(e.data.slice(1)) // OUTPUT
          // '1'=title, '2'=prefs — ignore
        }
      }

      ws.onerror = () => {
        if (connectionSeqRef.current !== connectionId) return
        onStatusRef.current('error')
        statusRef.current = 'error'
      }

      ws.onclose = () => {
        if (connectionSeqRef.current !== connectionId) return
        if (cleanupCloseRef.current) return
        if (statusRef.current !== 'error') {
          onStatusRef.current('disconnected')
          statusRef.current = 'disconnected'
        }
        term.write('\r\n\x1b[33mSesión cerrada.\x1b[0m\r\n')
      }
    }

    connect.current = () => {
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current)
        connectTimerRef.current = null
      }
      startConnection()
    }

    connectTimerRef.current = setTimeout(() => {
      connectTimerRef.current = null
      startConnection()
    }, 0)

    return () => {
      cleanupCloseRef.current = true
      connectionSeqRef.current += 1
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current)
        connectTimerRef.current = null
      }
      wsRef.current?.close()
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runnerId, sessionId])

  // ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => fitRef.current?.fit())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Fit when tab becomes active
  useEffect(() => {
    if (active) setTimeout(() => fitRef.current?.fit(), 30)
  }, [active])

  return <div ref={containerRef} className="w-full h-full" />
})

function sendResize(ws, cols, rows) {
  if (ws.readyState !== WebSocket.OPEN) return
  const json = JSON.stringify({ columns: cols, rows: rows })
  const encoded = new TextEncoder().encode(json)
  const buf = new Uint8Array(1 + encoded.length)
  buf[0] = 49 // RESIZE_TERMINAL opcode: ASCII '1'
  buf.set(encoded, 1)
  ws.send(buf.buffer)
}

export default TerminalPane
