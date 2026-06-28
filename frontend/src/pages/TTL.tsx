import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CacheFlowDiagram, type FlashState } from '../components/CacheFlowDiagram'
import { EventLog } from '../components/EventLog'
import { useSSE } from '../context/SSEContext'

export function TTL() {
  const { events, cacheEntries, clearEvents } = useSSE()
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  const [productId, setProductId] = useState('1')
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState<FlashState>(null)
  const [activeEdges, setActiveEdges] = useState<string[]>([])
  const [ttlMs, setTtlMs] = useState(30000)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [dbLatency, setDbLatency] = useState(300)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      clearEvents()
      prevPath.current = location.pathname
    }
  }, [location.pathname, clearEvents])

  // Tick for countdown bars
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])

  const lastEvent = events[events.length - 1]
  const lastEventRef = useRef<typeof lastEvent>(undefined)

  useEffect(() => {
    if (!lastEvent || lastEvent === lastEventRef.current) return
    lastEventRef.current = lastEvent

    if (lastEvent.type === 'cache_hit') {
      setActiveEdges(['client-cache', 'cache-client'])
      setFlash({ nodeId: 'cache', color: 'green' })
      setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1200)
    } else if (lastEvent.type === 'cache_miss') {
      setFlash({ nodeId: 'cache', color: 'red' })
      setTimeout(() => setFlash(null), 600)
    } else if (lastEvent.type === 'db_fetch') {
      setActiveEdges(['cache-db', 'db-cache'])
      setFlash({ nodeId: 'db', color: 'yellow' })
      setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1200)
    } else if (lastEvent.type === 'cache_set') {
      setActiveEdges(['cache-client'])
      setFlash({ nodeId: 'cache', color: 'blue' })
      setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1000)
    } else if (lastEvent.type === 'cache_expire') {
      setFlash({ nodeId: 'cache', color: 'red' })
      setTimeout(() => setFlash(null), 800)
    }
  }, [lastEvent])

  async function postConfig(patch: Record<string, unknown>) {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  async function fetchProduct() {
    setLoading(true)
    try {
      await fetch(`/api/products/${productId}`)
    } finally {
      setLoading(false)
    }
  }

  function expiryPercent(expiresAt: number): number {
    if (expiresAt === 0) return 100
    const effectiveTtl = ttlMs / speedMultiplier
    const remaining = expiresAt - now
    return Math.max(0, Math.min(100, (remaining / effectiveTtl) * 100))
  }

  return (
    <div className="flex flex-col h-full gap-4 p-6 overflow-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-100">TTL (Time To Live)</h1>
        <p className="text-sm text-gray-400 mt-1">
          Cache entries expire after their TTL. Use the speed multiplier to watch expiry happen
          faster. Each entry card shows a depleting countdown bar.
        </p>
      </div>

      <CacheFlowDiagram activeEdges={activeEdges} flash={flash} />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Fetch Product</h2>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={10}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-20 bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={fetchProduct}
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {loading ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Config</h2>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>TTL</span>
              <span>{ttlMs / 1000}s</span>
            </div>
            <input
              type="range"
              min={5000}
              max={60000}
              step={5000}
              value={ttlMs}
              onChange={(e) => {
                const v = Number(e.target.value)
                setTtlMs(v)
                postConfig({ ttlMs: v })
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>DB Latency</span>
              <span>{dbLatency}ms</span>
            </div>
            <input
              type="range"
              min={100}
              max={2000}
              step={100}
              value={dbLatency}
              onChange={(e) => {
                const v = Number(e.target.value)
                setDbLatency(v)
                postConfig({ latencyMs: v })
              }}
              className="w-full"
            />
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1.5">Speed Multiplier</p>
            <div className="flex gap-2">
              {[1, 5, 10].map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setSpeedMultiplier(m)
                    postConfig({ speedMultiplier: m })
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    speedMultiplier === m
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {m}×
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cache entry cards */}
      {cacheEntries.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Cache Entries</h2>
          <div className="grid grid-cols-2 gap-2">
            {cacheEntries.map((entry) => {
              const pct = expiryPercent(entry.expiresAt)
              const barColor = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500'
              return (
                <div key={entry.key} className="bg-gray-900 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-gray-300">{entry.key}</span>
                    <span className="text-xs text-gray-500">
                      {entry.expiresAt > 0
                        ? `${Math.max(0, Math.ceil((entry.expiresAt - now) / 1000))}s`
                        : '∞'}
                    </span>
                  </div>
                  {entry.expiresAt > 0 && (
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} transition-all duration-200`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-48 bg-gray-800 rounded-xl overflow-hidden">
        <EventLog events={events.filter(e => e.type !== 'cache_state')} onClear={clearEvents} />
      </div>
    </div>
  )
}
