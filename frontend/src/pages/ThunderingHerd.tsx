import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CacheFlowDiagram, type FlashState } from '../components/CacheFlowDiagram'
import { EventLog } from '../components/EventLog'
import { useSSE } from '../context/SSEContext'

export function ThunderingHerd() {
  const { events, clearEvents } = useSSE()
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  const [n, setN] = useState(5)
  const [singleflight, setSingleflight] = useState(false)
  const [firing, setFiring] = useState(false)
  const [flash, setFlash] = useState<FlashState>(null)
  const [activeEdges, setActiveEdges] = useState<string[]>([])
  const [dbBadge, setDbBadge] = useState<number | null>(null)
  const inFlightRef = useRef(0)

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      clearEvents()
      prevPath.current = location.pathname
    }
  }, [location.pathname, clearEvents])

  // Process all new events without delay — ThunderingHerd visualizes parallel bursts,
  // not sequential steps, so all events in a batch fire simultaneously.
  const processedCount = useRef(0)

  useEffect(() => {
    const newEvents = events.slice(processedCount.current)
    processedCount.current = events.length
    if (newEvents.length === 0) return

    const timers: ReturnType<typeof setTimeout>[] = []

    for (const event of newEvents) {
      if (event.type === 'cache_hit') {
        setActiveEdges(['client-cache', 'cache-client'])
        setFlash({ nodeId: 'cache', color: 'green' })
        timers.push(setTimeout(() => { setActiveEdges([]); setFlash(null) }, 800))
      } else if (event.type === 'cache_miss') {
        setFlash({ nodeId: 'cache', color: 'red' })
        timers.push(setTimeout(() => setFlash(null), 400))
      } else if (event.type === 'db_fetch') {
        setActiveEdges(['cache-db'])
        setFlash({ nodeId: 'db', color: 'yellow' })
        timers.push(setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1200))
      } else if (event.type === 'cache_set') {
        setFlash({ nodeId: 'cache', color: 'blue' })
        timers.push(setTimeout(() => setFlash(null), 600))
      }
    }

    return () => timers.forEach(clearTimeout)
  }, [events])

  async function toggleSingleflight(enabled: boolean) {
    setSingleflight(enabled)
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ singleflightEnabled: enabled }),
    })
  }

  async function fire() {
    setFiring(true)
    clearEvents()

    // First reset the cache so every request is a miss
    await fetch('/api/cache/reset', { method: 'POST' })

    // Animate the herd
    setActiveEdges(['client-cache'])

    const requests = Array.from({ length: n }, () =>
      (async () => {
        inFlightRef.current++
        setDbBadge(inFlightRef.current)
        try {
          await fetch('/api/products/1')
        } finally {
          inFlightRef.current--
          setDbBadge(inFlightRef.current > 0 ? inFlightRef.current : null)
        }
      })()
    )

    await Promise.all(requests)
    setFiring(false)
    setActiveEdges([])
  }

  // Dedupe db_fetch events to count actual DB hits
  const dbFetches = events.filter(e => e.type === 'db_fetch').length
  const cacheMisses = events.filter(e => e.type === 'cache_miss').length
  const cacheHits = events.filter(e => e.type === 'cache_hit').length

  return (
    <div className="flex flex-col h-full gap-4 p-6 overflow-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Thundering Herd</h1>
        <p className="text-sm text-gray-400 mt-1">
          Fire N concurrent requests simultaneously. Without singleflight, all N miss and hammer
          the DB. With singleflight, only one DB fetch happens — the rest wait and share the result.
        </p>
      </div>

      <CacheFlowDiagram activeEdges={activeEdges} flash={flash} dbBadge={dbBadge} />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Fire Herd</h2>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Concurrent requests (N)</span>
              <span>{n}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <button
            onClick={fire}
            disabled={firing}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg px-4 py-2 transition-colors"
          >
            {firing ? `Firing ${n} requests…` : `Fire ${n} Requests`}
          </button>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Singleflight</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => toggleSingleflight(!singleflight)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                singleflight ? 'bg-indigo-600' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  singleflight ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-sm text-gray-300">
              {singleflight ? 'Enabled — requests deduplicated' : 'Disabled — all requests hit DB'}
            </span>
          </label>
          <p className="text-xs text-gray-500">
            Uses <code className="text-gray-400">golang.org/x/sync/singleflight</code> — a real
            deduplication, not a simulation.
          </p>
        </div>
      </div>

      {/* Stats */}
      {(dbFetches > 0 || cacheMisses > 0) && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{cacheMisses}</div>
            <div className="text-xs text-gray-500 mt-1">Cache Misses</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">{dbFetches}</div>
            <div className="text-xs text-gray-500 mt-1">DB Fetches</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-400">{cacheHits}</div>
            <div className="text-xs text-gray-500 mt-1">Cache Hits</div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-48 bg-gray-800 rounded-xl overflow-hidden">
        <EventLog events={events.filter(e => e.type !== 'cache_state')} onClear={clearEvents} />
      </div>
    </div>
  )
}
