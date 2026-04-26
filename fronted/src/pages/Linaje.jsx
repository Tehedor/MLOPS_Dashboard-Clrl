import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { getLineageStatus, getLineageHtml, refreshLineage } from '../api/lineage'
import { getSyncInterval } from '../api/variants'

const DARK_STYLE = `<style>
html {
  filter: invert(1) hue-rotate(180deg) brightness(1.4) contrast(0.88);
  background: #e0e0e0;
}
img, video, canvas { filter: invert(1) hue-rotate(180deg); }
</style>`

function injectDarkMode(html) {
  if (html.includes('<head>')) return html.replace('<head>', `<head>${DARK_STYLE}`)
  if (html.includes('<html>')) return html.replace('<html>', `<html>${DARK_STYLE}`)
  return DARK_STYLE + html
}

function useDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

export default function Linaje() {
  const qc = useQueryClient()

  const { data: intervals = {} } = useQuery({
    queryKey: ['sync-interval'],
    queryFn: getSyncInterval,
    staleTime: Infinity,
  })
  const tableRefreshMs = (intervals.table_refresh_seconds ?? 15) * 1000

  const { data: status } = useQuery({
    queryKey: ['lineage-status'],
    queryFn: getLineageStatus,
    refetchInterval: tableRefreshMs,
  })

  const { data: html, isFetching: htmlFetching } = useQuery({
    queryKey: ['lineage-html', status?.sha],
    queryFn: getLineageHtml,
    enabled: status?.html_ready === true,
    staleTime: Infinity,
  })

  const { mutate: doRefresh, isPending } = useMutation({
    mutationFn: refreshLineage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lineage-status'] })
      qc.invalidateQueries({ queryKey: ['lineage-html'] })
    },
  })

  const isDark = useDarkMode()
  const srcDoc = useMemo(
    () => (html && isDark ? injectDarkMode(html) : html),
    [html, isDark]
  )

  const isWorking = isPending || htmlFetching
  const sha = status?.sha
  const updatedAt = status?.updated_at ? new Date(status.updated_at).toLocaleString() : null

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem)] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-300 dark:border-gray-800">
        <span className="font-semibold text-sm text-gray-900 dark:text-white">Pipeline Lineage</span>

        {status && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {status.repo} · {status.branch}
            {sha && <> · <code className="font-mono">{sha.slice(0, 8)}</code></>}
            {updatedAt && <> · {updatedAt}</>}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isWorking && <Spinner />}
          {status?.error && (
            <span
              className="text-xs text-red-500 dark:text-red-400 max-w-xs truncate"
              title={status.error}
            >
              Error: {status.error.slice(0, 80)}
            </span>
          )}
          <button
            onClick={() => doRefresh()}
            disabled={isPending}
            className="px-3 py-1 text-xs font-medium rounded border transition-colors
              border-gray-300 text-gray-700 hover:bg-gray-200 disabled:opacity-50
              dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {isPending ? 'Generando…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {srcDoc ? (
          <iframe
            srcDoc={srcDoc}
            className="w-full h-full border-0"
            title="Pipeline Lineage"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400 gap-2">
            {isWorking && <Spinner />}
            <span>
              {isPending
                ? <>Ejecutando <code className="font-mono">make generate_lineage</code>…</>
                : 'Cargando linaje…'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
