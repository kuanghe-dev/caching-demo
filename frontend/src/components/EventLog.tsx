import { useEffect, useRef } from 'react'
import type { CacheEvent } from '../context/SSEContext'

const eventColor: Record<string, string> = {
  cache_hit: 'text-green-400',
  cache_miss: 'text-red-400',
  db_fetch: 'text-yellow-400',
  cache_set: 'text-blue-400',
  cache_delete: 'text-orange-400',
  cache_expire: 'text-gray-400',
}

function formatEvent(e: CacheEvent): string {
  switch (e.type) {
    case 'cache_hit':
      return `HIT  ${e.key}`
    case 'cache_miss':
      return `MISS ${e.key}`
    case 'db_fetch':
      return `DB   ${e.key} (${e.latencyMs}ms)`
    case 'cache_set':
      return `SET  ${e.key} ttl=${e.ttlMs}ms`
    case 'cache_delete':
      return `DEL  ${e.key}`
    case 'cache_expire':
      return `EXP  ${e.key}`
    default:
      return e.type
  }
}

type Props = {
  events: CacheEvent[]
  onClear: () => void
}

export function EventLog({ events, onClear }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Event Log</span>
        <button
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
        {events.length === 0 && (
          <p className="text-gray-600 italic">No events yet. Try fetching a product.</p>
        )}
        {events.map((e, i) => (
          <div key={i} className={`${eventColor[e.type] ?? 'text-gray-300'} leading-5`}>
            {formatEvent(e)}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
