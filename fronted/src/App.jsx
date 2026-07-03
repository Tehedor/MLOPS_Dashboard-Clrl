import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Shell from './components/layout/Shell'
import Vista1 from './pages/Vista1'
import Vista2 from './pages/Vista2'
import LogsRunners from './pages/LogsRunners'
import Vista4 from './pages/Vista4'
import Linaje from './pages/Linaje'
import Variants from './pages/Variants'
import Services from './pages/Services'

function AppContent() {
  const location = useLocation()
  const isRunners = location.pathname === '/runners'

  return (
    <Shell>
      {/* Runners stays mounted to preserve terminal sessions across navigation */}
      <div style={{ display: isRunners ? 'block' : 'none', height: '100%' }}>
        <Vista4 />
      </div>

      {!isRunners && (
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Vista1 />} />
          <Route path="/executions" element={<Vista2 />} />
          <Route path="/github-actions" element={<LogsRunners />} />
          <Route path="/runners" element={<Vista4 />} />
          <Route path="/lineage" element={<Linaje />} />
          <Route path="/variants" element={<Variants />} />
          <Route path="/services" element={<Services />} />
        </Routes>
      )}
    </Shell>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppContent />
    </BrowserRouter>
  )
}
