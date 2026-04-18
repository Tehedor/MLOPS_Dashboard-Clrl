import { NavLink } from 'react-router-dom'

const VIEWS = [
  { to: '/vista1', label: 'Dashboard' },
  { to: '/vista2', label: 'Ejecuciones' },
  { to: '/vista3', label: 'Logs' },
  { to: '/vista4', label: 'Runners' },
]

export default function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="h-12 border-b border-gray-800 flex items-center px-4 gap-6 shrink-0">
        <span className="font-semibold text-sm tracking-wide text-white">MLOps</span>
        <nav className="flex gap-1 flex-1">
          {VIEWS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <a
          href="https://github.com/Tehedor/MLOps_actions_v2"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          GitHub Actions →
        </a>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
