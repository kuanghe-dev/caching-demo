import { NavLink } from 'react-router-dom'

const concepts = [
  { path: '/cache-hit-miss', label: 'Cache Hit / Miss' },
  { path: '/ttl', label: 'TTL' },
  { path: '/cache-invalidation', label: 'Cache Invalidation' },
  { path: '/population-strategies', label: 'Population Strategies' },
  { path: '/thundering-herd', label: 'Thundering Herd' },
]

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 text-gray-300 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-700">
        <span className="text-white font-semibold text-sm tracking-wide">Caching Demo</span>
      </div>
      <nav className="flex-1 py-3">
        {concepts.map((c, i) => (
          <NavLink
            key={c.path}
            to={c.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
              {i + 1}
            </span>
            {c.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
