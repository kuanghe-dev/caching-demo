import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SSEProvider } from './context/SSEContext'
import { Sidebar } from './components/Sidebar'
import { CacheHitMiss } from './pages/CacheHitMiss'
import { TTL } from './pages/TTL'
import { CacheInvalidation } from './pages/CacheInvalidation'
import { PopulationStrategies } from './pages/PopulationStrategies'
import { ThunderingHerd } from './pages/ThunderingHerd'

export default function App() {
  return (
    <BrowserRouter>
      <SSEProvider>
        <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/cache-hit-miss" replace />} />
              <Route path="/cache-hit-miss" element={<CacheHitMiss />} />
              <Route path="/ttl" element={<TTL />} />
              <Route path="/cache-invalidation" element={<CacheInvalidation />} />
              <Route path="/population-strategies" element={<PopulationStrategies />} />
              <Route path="/thundering-herd" element={<ThunderingHerd />} />
            </Routes>
          </main>
        </div>
      </SSEProvider>
    </BrowserRouter>
  )
}
