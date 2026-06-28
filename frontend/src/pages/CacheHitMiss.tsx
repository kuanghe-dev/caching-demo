import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CacheFlowDiagram, type FlashState } from '../components/CacheFlowDiagram'
import { EventLog } from '../components/EventLog'
import { useSSE } from '../context/SSEContext'

export function CacheHitMiss() {
  const { events, clearEvents } = useSSE()
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  const [productId, setProductId] = useState('1')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [flash, setFlash] = useState<FlashState>(null)
  const [activeEdges, setActiveEdges] = useState<string[]>([])
  const [dbLatency, setDbLatency] = useState(300)

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      clearEvents()
      prevPath.current = location.pathname
    }
  }, [location.pathname, clearEvents])

  // React to incoming events for animations.
  // Process all new events as a sequential queue so that db_fetch and cache_set
  // arriving in the same React batch don't cause db_fetch to be silently skipped.
  const processedCount = useRef(0)

  useEffect(() => {
    const newEvents = events.slice(processedCount.current)
    processedCount.current = events.length
    if (newEvents.length === 0) return

    let delay = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const event of newEvents) {
      if (event.type === 'cache_hit') {
        const d = delay
        timers.push(setTimeout(() => {
          setActiveEdges(['client-cache', 'cache-client'])
          setFlash({ nodeId: 'cache', color: 'green' })
          setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1200)
        }, d))
        delay += 1200
      } else if (event.type === 'cache_miss') {
        const d = delay
        timers.push(setTimeout(() => {
          setFlash({ nodeId: 'cache', color: 'red' })
          setTimeout(() => setFlash(null), 600)
        }, d))
        delay += 600
      } else if (event.type === 'db_fetch') {
        const d = delay
        timers.push(setTimeout(() => {
          setActiveEdges(['cache-db', 'db-cache'])
          setFlash({ nodeId: 'db', color: 'yellow' })
          setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1200)
        }, d))
        delay += 1200
      } else if (event.type === 'cache_set') {
        const d = delay
        timers.push(setTimeout(() => {
          setActiveEdges(['cache-client'])
          setFlash({ nodeId: 'cache', color: 'blue' })
          setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1000)
        }, d))
        delay += 1000
      }
    }

    return () => timers.forEach(clearTimeout)
  }, [events])

  async function fetchProduct() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/products/${productId}`)
      const data = await res.json()
      setResult(JSON.stringify(data, null, 2))
    } catch {
      setResult('Error fetching product')
    } finally {
      setLoading(false)
    }
  }

  async function updateDbLatency(ms: number) {
    setDbLatency(ms)
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latencyMs: ms }),
    })
  }

  return (
    <div className="flex flex-col h-full gap-4 p-6 overflow-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Cache Hit / Miss</h1>
        <p className="text-sm text-gray-400 mt-1">
          Fetch a product to see cache-aside logic in action. First fetch is a miss — the DB is
          queried. Subsequent fetches hit the cache instantly.
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
              placeholder="ID"
            />
            <button
              onClick={fetchProduct}
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {loading ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
          {result && (
            <pre className="text-xs text-green-300 bg-gray-900 rounded-lg p-3 overflow-auto max-h-32">
              {result}
            </pre>
          )}
        </div>

        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">DB Latency</h2>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={100}
              max={2000}
              step={100}
              value={dbLatency}
              onChange={(e) => updateDbLatency(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-gray-400 w-16 text-right">{dbLatency}ms</span>
          </div>
          <p className="text-xs text-gray-500">
            Increase latency to make cache misses feel expensive.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-48 bg-gray-800 rounded-xl overflow-hidden">
        <EventLog events={events.filter(e => e.type !== 'cache_state')} onClear={clearEvents} />
      </div>
    </div>
  )
}
