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
  const isVista4 = location.pathname === '/vista4'

  return (
    <Shell>
      {/* Vista4 stays mounted to preserve terminal sessions across navigation */}
      <div style={{ display: isVista4 ? 'block' : 'none', height: '100%' }}>
        <Vista4 />
      </div>

      {!isVista4 && (
        <Routes>
          <Route path="/" element={<Navigate to="/vista1" replace />} />
          <Route path="/vista1" element={<Vista1 />} />
          <Route path="/vista2" element={<Vista2 />} />
          <Route path="/vista3" element={<LogsRunners />} />
          <Route path="/linaje" element={<Linaje />} />
          <Route path="/variants" element={<Variants />} />
          <Route path="/services" element={<Services />} />
        </Routes>
      )}
    </Shell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
