import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'

export type CacheEntry = {
  key: string
  value: string
  expiresAt: number // unix ms, 0 = no expiry
}

export type CacheEvent =
  | { type: 'cache_hit'; key: string; value: string }
  | { type: 'cache_miss'; key: string }
  | { type: 'db_fetch'; key: string; latencyMs: number }
  | { type: 'cache_set'; key: string; value: string; ttlMs: number }
  | { type: 'cache_delete'; key: string }
  | { type: 'cache_expire'; key: string }
  | { type: 'cache_state'; entries: CacheEntry[] }

type SSEContextValue = {
  events: CacheEvent[]
  cacheEntries: CacheEntry[]
  clearEvents: () => void
}

const SSEContext = createContext<SSEContextValue>({
  events: [],
  cacheEntries: [],
  clearEvents: () => {},
})

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const [events, dispatch] = useReducer(
    (state: CacheEvent[], action: { type: 'add'; event: CacheEvent } | { type: 'clear' }) => {
      if (action.type === 'clear') return []
      if (action.event.type === 'cache_state') return state
      return [...state, action.event]
    },
    []
  )
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([])
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    function connect() {
      const es = new EventSource('/events')
      esRef.current = es

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as CacheEvent
          if (event.type === 'cache_state') {
            setCacheEntries(event.entries)
          } else {
            dispatch({ type: 'add', event })
          }
        } catch {
          // ignore malformed events
        }
      }

      es.onerror = () => {
        es.close()
        setTimeout(connect, 2000)
      }
    }

    connect()
    return () => esRef.current?.close()
  }, [])

  return (
    <SSEContext.Provider value={{ events, cacheEntries, clearEvents: () => dispatch({ type: 'clear' }) }}>
      {children}
    </SSEContext.Provider>
  )
}

export function useSSE() {
  return useContext(SSEContext)
}
