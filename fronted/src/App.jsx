import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Shell from './components/layout/Shell'
import Vista1 from './pages/Vista1'
import Vista2 from './pages/Vista2'
import Vista3 from './pages/Vista3'
import Vista4 from './pages/Vista4'
import Linaje from './pages/Linaje'
import Variants from './pages/Variants'

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/vista1" replace />} />
          <Route path="/vista1" element={<Vista1 />} />
          <Route path="/vista2" element={<Vista2 />} />
          <Route path="/vista3" element={<Vista3 />} />
          <Route path="/vista4" element={<Vista4 />} />
          <Route path="/linaje" element={<Linaje />} />
          <Route path="/variants" element={<Variants />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
