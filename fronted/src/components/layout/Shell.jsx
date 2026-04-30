import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import appConfig from '@appConfig'

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
        <a
          href={`${appConfig.dagshub_repository}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs transition-colors text-gray-600 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        >
          DagsHub →
        </a>
        <a
          href={`${appConfig.mlflow_tracking_uri}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs transition-colors text-gray-600 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        >
          MLFlow →
        </a>
        <a
          href={`https://github.com/${appConfig.github_actions_repository}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs transition-colors text-gray-600 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        >
          GitHub Actions →
        </a>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
