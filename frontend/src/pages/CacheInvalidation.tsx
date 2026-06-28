import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CacheFlowDiagram, type FlashState } from '../components/CacheFlowDiagram'
import { EventLog } from '../components/EventLog'
import { useSSE } from '../context/SSEContext'

export function CacheInvalidation() {
  const { events, cacheEntries, clearEvents } = useSSE()
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  const [productId, setProductId] = useState('1')
  const [loading, setLoading] = useState(false)
  const [updateLoading, setUpdateLoading] = useState(false)
  const [invalidate, setInvalidate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [flash, setFlash] = useState<FlashState>(null)
  const [activeEdges, setActiveEdges] = useState<string[]>([])
  const [staleKeys, setStaleKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      clearEvents()
      setStaleKeys(new Set())
      prevPath.current = location.pathname
    }
  }, [location.pathname, clearEvents])

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
        // Stale key removal is data state — update immediately, not in the animation queue
        const key = event.key
        setStaleKeys((prev) => { const next = new Set(prev); next.delete(key); return next })
        const d = delay
        timers.push(setTimeout(() => {
          setActiveEdges(['cache-client'])
          setFlash({ nodeId: 'cache', color: 'blue' })
          setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1000)
        }, d))
        delay += 1000
      } else if (event.type === 'cache_delete') {
        const key = event.key
        setStaleKeys((prev) => { const next = new Set(prev); next.delete(key); return next })
        const d = delay
        timers.push(setTimeout(() => {
          setActiveEdges(['client-cache'])
          setFlash({ nodeId: 'cache', color: 'red' })
          setTimeout(() => { setActiveEdges([]); setFlash(null) }, 800)
        }, d))
        delay += 800
      }
    }

    return () => timers.forEach(clearTimeout)
  }, [events])

  async function fetchProduct() {
    setLoading(true)
    try {
      await fetch(`/api/products/${productId}`)
    } finally {
      setLoading(false)
    }
  }

  async function updateProduct() {
    if (!newName && !newPrice) return
    setUpdateLoading(true)

    const key = `product:${productId}`
    // Find current cached value to base the update on
    const cachedEntry = cacheEntries.find(e => e.key === key)
    let current = { name: 'Product', price: 0 }
    if (cachedEntry) {
      try { current = JSON.parse(cachedEntry.value) } catch { /* ignore */ }
    }

    const updated = {
      name: newName || current.name,
      price: newPrice ? parseFloat(newPrice) : current.price,
    }

    try {
      await fetch(`/api/products/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(updated), invalidate }),
      })

      if (!invalidate && cacheEntries.some(e => e.key === key)) {
        setStaleKeys((prev) => new Set([...prev, key]))
      }
    } finally {
      setUpdateLoading(false)
      setNewName('')
      setNewPrice('')
    }
  }

  return (
    <div className="flex flex-col h-full gap-4 p-6 overflow-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Cache Invalidation</h1>
        <p className="text-sm text-gray-400 mt-1">
          Fetch a product to populate the cache, then update the DB value. Without invalidation,
          stale data is served. Toggle &ldquo;Invalidate on write&rdquo; to see the correct pattern.
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
          <h2 className="text-sm font-semibold text-gray-300">Update DB Value</h2>
          <input
            type="text"
            placeholder="New name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="number"
            placeholder="New price"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={invalidate}
              onChange={(e) => setInvalidate(e.target.checked)}
              className="accent-indigo-500"
            />
            <span className="text-sm text-gray-300">Invalidate on write</span>
          </label>
          <button
            onClick={updateProduct}
            disabled={updateLoading || (!newName && !newPrice)}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {updateLoading ? 'Updating…' : 'Update'}
          </button>
        </div>
      </div>

      {/* Cache entries with stale indicators */}
      {cacheEntries.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Cache Entries</h2>
          <div className="grid grid-cols-2 gap-2">
            {cacheEntries.map((entry) => {
              const isStale = staleKeys.has(entry.key)
              return (
                <div
                  key={entry.key}
                  className={`bg-gray-900 rounded-lg p-3 border ${
                    isStale ? 'border-yellow-500/60' : 'border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-gray-300">{entry.key}</span>
                    {isStale && (
                      <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">
                        STALE
                      </span>
                    )}
                  </div>
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
