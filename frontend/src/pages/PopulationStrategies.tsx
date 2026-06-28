import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CacheFlowDiagram, type FlashState } from '../components/CacheFlowDiagram'
import { EventLog } from '../components/EventLog'
import { useSSE } from '../context/SSEContext'

type Strategy = 'cache-aside' | 'read-through' | 'write-through'

const strategies: { id: Strategy; label: string; description: string }[] = [
  {
    id: 'cache-aside',
    label: 'Cache-Aside',
    description:
      'The application is responsible for loading data into the cache. On a miss, the app fetches from the DB and writes to the cache. Simple and explicit — the app controls what gets cached.',
  },
  {
    id: 'read-through',
    label: 'Read-Through',
    description:
      'The cache sits in front of the DB and handles misses automatically. The app only ever talks to the cache — the cache layer is responsible for fetching from the DB and populating itself.',
  },
  {
    id: 'write-through',
    label: 'Write-Through',
    description:
      'Every write goes to the cache and DB simultaneously. Reads always hit the cache. Trades write latency for always-consistent reads — no stale data possible.',
  },
]

// Which edges to animate per strategy on a miss / write
const strategyEdges: Record<Strategy, { read: string[]; write: string[] }> = {
  'cache-aside': { read: ['client-cache', 'client-db', 'db-cache', 'cache-client'], write: ['client-db'] },
  'read-through': { read: ['client-cache', 'cache-db', 'db-cache', 'cache-client'], write: ['client-db'] },
  'write-through': { read: ['client-cache', 'cache-client'], write: ['client-cache', 'client-db'] },
}

export function PopulationStrategies() {
  const { events, clearEvents } = useSSE()
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  const [strategy, setStrategy] = useState<Strategy>('cache-aside')
  const [productId, setProductId] = useState('1')
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)
  const [writeLoading, setWriteLoading] = useState(false)
  const [flash, setFlash] = useState<FlashState>(null)
  const [activeEdges, setActiveEdges] = useState<string[]>([])

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      clearEvents()
      prevPath.current = location.pathname
    }
  }, [location.pathname, clearEvents])

  async function switchStrategy(s: Strategy) {
    setStrategy(s)
    clearEvents()
    await fetch('/api/cache/reset', { method: 'POST' })
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: s }),
    })
  }

  const lastEvent = events[events.length - 1]
  const lastEventRef = useRef<typeof lastEvent>(undefined)

  useEffect(() => {
    if (!lastEvent || lastEvent === lastEventRef.current) return
    lastEventRef.current = lastEvent

    const edges = strategyEdges[strategy]

    if (lastEvent.type === 'cache_hit') {
      setActiveEdges(edges.read.slice(0, 2))
      setFlash({ nodeId: 'cache', color: 'green' })
      setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1200)
    } else if (lastEvent.type === 'cache_miss' || lastEvent.type === 'db_fetch') {
      setActiveEdges(edges.read)
      setFlash({ nodeId: 'db', color: 'yellow' })
      setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1500)
    } else if (lastEvent.type === 'cache_set') {
      setFlash({ nodeId: 'cache', color: 'blue' })
      setTimeout(() => setFlash(null), 800)
    }
  }, [lastEvent, strategy])

  async function fetchProduct() {
    setFetchLoading(true)
    try {
      await fetch(`/api/products/${productId}`)
    } finally {
      setFetchLoading(false)
    }
  }

  async function writeProduct() {
    if (!newName && !newPrice) return
    setWriteLoading(true)
    const key = `product:${productId}`
    const updated = {
      name: newName || 'Updated Product',
      price: newPrice ? parseFloat(newPrice) : 9.99,
    }

    // Animate write edges
    setActiveEdges(strategyEdges[strategy].write)
    setFlash({ nodeId: 'db', color: 'yellow' })
    setTimeout(() => { setActiveEdges([]); setFlash(null) }, 1500)

    try {
      await fetch(`/api/products/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: JSON.stringify(updated),
          invalidate: strategy === 'cache-aside',
        }),
      })
    } finally {
      setWriteLoading(false)
      setNewName('')
      setNewPrice('')
    }
    return key
  }

  const active = strategies.find((s) => s.id === strategy)!

  return (
    <div className="flex flex-col h-full gap-4 p-6 overflow-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Population Strategies</h1>
        <p className="text-sm text-gray-400 mt-1">
          Compare Cache-Aside, Read-Through, and Write-Through. The cache resets on tab switch so
          each strategy starts clean.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
        {strategies.map((s) => (
          <button
            key={s.id}
            onClick={() => switchStrategy(s.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              strategy === s.id
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <CacheFlowDiagram activeEdges={activeEdges} flash={flash} />

      <div className="bg-gray-700/50 rounded-xl p-4 text-sm text-gray-300 leading-relaxed">
        {active.description}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Read</h2>
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
              disabled={fetchLoading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {fetchLoading ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Write</h2>
          <input
            type="text"
            placeholder="New name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={writeProduct}
            disabled={writeLoading || (!newName && !newPrice)}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {writeLoading ? 'Writing…' : 'Write to DB'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-48 bg-gray-800 rounded-xl overflow-hidden">
        <EventLog events={events.filter(e => e.type !== 'cache_state')} onClear={clearEvents} />
      </div>
    </div>
  )
}
