import { NavLink } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import pipelinesConfig from '@pipelinesConfig'
import runnersConfig from '@phasesRunner'

const _allProjects = Object.entries(pipelinesConfig?.pipelines ?? {})

function NavDropdown({ label, urlFn }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const items = _allProjects.map(([id, proj]) => ({
    key: id,
    label: proj.label || id,
    color: proj.color || null,
    url: urlFn(proj) || null,
  }))

  if (items.length === 1) {
    const { label: pl, color, url } = items[0]
    return url
      ? (
        <a href={url} target="_blank" rel="noreferrer"
          className="text-xs transition-colors flex items-center gap-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        >
          {color && <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
          {label} →
        </a>
      )
      : <span className="text-xs text-gray-400 dark:text-gray-700 cursor-default">{label}</span>
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs transition-colors text-gray-600 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300 flex items-center gap-0.5"
      >
        {label} <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[11rem] bg-white border border-gray-200 rounded shadow-lg dark:bg-gray-900 dark:border-gray-700">
          {items.map(({ key, label: pl, color, url }) =>
            url ? (
              <a
                key={key}
                href={url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 whitespace-nowrap"
              >
                {color && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                )}
                {pl} →
              </a>
            ) : (
              <span
                key={key}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 dark:text-gray-600 whitespace-nowrap cursor-default"
              >
                {color && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 opacity-40" style={{ backgroundColor: color }} />
                )}
                {pl} (no disponible)
              </span>
            )
          )}
        </div>
      )}
    </div>
  )
}

const VIEWS = [
  { to: '/vista1', label: 'Dashboard' },
  { to: '/vista2', label: 'Ejecuciones' },
  { to: '/vista3', label: 'GH Actions' },
  { to: '/vista4', label: 'Runners' },
  { to: '/linaje', label: 'Linaje' },
  { to: '/variants', label: 'Variantes' },
  { to: '/services', label: 'Servicios' },
]

export default function Shell({ children }) {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    return 'light'
  })

  useEffect(() => {
    localStorage.setItem('theme', theme)
    document.documentElement.style.colorScheme = theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const isDark = theme === 'dark'

  return (
    <div className="h-screen flex flex-col transition-colors bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="h-12 border-b flex items-center px-4 gap-3 shrink-0 transition-colors border-gray-300 dark:border-gray-800">
        <span className="font-semibold text-sm tracking-wide text-gray-900 dark:text-white">MLOps</span>
        <nav className="flex gap-1 flex-1">
          {VIEWS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-300 text-gray-900 dark:bg-gray-700 dark:text-white'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          title={isDark ? 'Modo claro' : 'Modo oscuro'}
          className="w-8 h-8 inline-flex items-center justify-center rounded border text-sm leading-none transition-colors border-gray-300 text-gray-700 hover:text-gray-900 hover:border-gray-500 dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:border-gray-500"
        >
          {isDark ? (
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
          ) : (
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
          <span className="sr-only">{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>
        <NavDropdown label="DagsHub" urlFn={(p) => p.dagshub_repository ?? null} />
        <NavDropdown label="MLFlow" urlFn={(p) => p.mlflow_tracking_uri ?? null} />
        <NavDropdown label="GitHub Actions" urlFn={(p) => p.repo ? `https://github.com/${p.repo}` : null} />
        {runnersConfig?.url_ctrl_runners && (
          <a
            href={runnersConfig.url_ctrl_runners}
            target="_blank"
            rel="noreferrer"
            className="text-xs transition-colors flex items-center gap-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
          >
            GH Runners →
          </a>
        )}
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
