# CLAUDE.md — Caching Demo

User-facing documentation is in [README.md](./README.md). This file covers developer and agent context.

## Project Overview

An interactive caching demo with a Go backend and React frontend. The backend implements real caching logic; the frontend visualizes backend state in real time via SSE. The goal is to help developers understand caching concepts by interacting with a working system, not just watching a simulation.

## Monorepo Structure

```
caching-demo/
├── cmd/
│   └── server/         # Go entrypoint
├── internal/
│   ├── cache/          # Cache interface + in-memory implementation + tests
│   ├── db/             # Simulated database (fixed product dataset, artificial latency)
│   ├── sse/            # SSE event emitter and broker
│   └── handler/        # chi HTTP handlers (REST + SSE endpoint)
├── frontend/           # Vite + React + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/ # Shared UI components (sidebar, event log, node diagram)
│   │   └── pages/      # One page per concept
│   └── vite.config.ts  # Proxies /api and /events to :8080 in dev
├── go.mod              # module github.com/kuanghe-dev/caching-demo
└── README.md
```

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Go router | chi | Lightweight, stdlib-compatible, no framework lock-in |
| Real-time | SSE | Server→client only; REST handles client→server. Simpler than WebSockets. |
| Frontend | React + TypeScript + Vite | Type safety, fast HMR |
| Styling | Tailwind | Fast layout iteration; custom CSS for SVG/React Flow details |
| Graph | React Flow | Animated edges on a static node layout (drag/pan/zoom disabled) |

## Dev vs. Prod

- **Dev**: Go backend on `:8080`, Vite dev server on `:5173`. Vite proxies `/api/*` and `/events` to `:8080`. No CORS config needed.
- **Prod**: `cd frontend && npm run build`, then `go build`. The Go binary uses `go:embed` to serve the built frontend as static files. Everything runs on `:8080`.

## Cache Interface

The cache sits behind an interface so the in-memory implementation can be swapped for Redis without touching strategy logic:

```go
type Cache interface {
    Get(ctx context.Context, key string) (string, bool, error)
    Set(ctx context.Context, key string, value string, ttl time.Duration) error
    Delete(ctx context.Context, key string) error
}
```

The in-memory implementation lives in `internal/cache/memory.go`. A future `internal/cache/redis.go` would implement the same interface. A `--cache` flag at startup selects the implementation.

## SSE Event Schema

All events are JSON. The frontend discriminates on the `type` field.

```typescript
type CacheEvent =
  | { type: "cache_hit";    key: string; value: string }
  | { type: "cache_miss";   key: string }
  | { type: "db_fetch";     key: string; latencyMs: number }
  | { type: "cache_set";    key: string; value: string; ttlMs: number }
  | { type: "cache_delete"; key: string }
  | { type: "cache_expire"; key: string }
  | { type: "cache_state";  entries: { key: string; value: string; expiresAt: number }[] }
```

`cache_state` is emitted on SSE connect and after every mutation so the frontend stays in sync. All other events drive animations.

## Simulated Database

- 10 fixed products: `product:1` through `product:10`, each with a name and price
- Artificial latency: configurable via `POST /api/config` (default 300ms, range 100ms–2000ms)
- Lives in `internal/db/`

## Per-Concept Interactions

### Cache Hit / Miss
- User fetches a product by ID
- Cache hit → green flash, event log shows `cache_hit`
- Cache miss → red flash, DB fetch animates, `cache_set` populates the cache

### TTL
- Global TTL slider (5s–60s) + speed multiplier (1x / 5x / 10x) applied server-side
- Cache entry cards show a depleting countdown bar
- On expiry, backend emits `cache_expire`, card fades out

### Cache Invalidation
- User fetches a product (populates cache), then updates the DB value
- Without invalidation: stale value is served from cache — shown with a "STALE" warning
- With invalidation: `cache_delete` is emitted alongside the DB write; next fetch is fresh

### Population Strategies
- Tab switcher within the page: Cache-Aside / Read-Through / Write-Through
- Each tab resets cache state on switch
- Same read/write controls; animated arrows show which actor (app vs. cache layer) does the DB fetch

### Thundering Herd
- N slider (1–20) + "Fire" button: fires N concurrent GET requests simultaneously
- Without singleflight: N `cache_miss` + N `db_fetch` events, DB hammered in parallel
- With singleflight toggle: one `db_fetch`, rest wait, all resolve together
- Backend uses `golang.org/x/sync/singleflight` — this is a real implementation, not simulated

## Frontend Layout

- Left sidebar: 5 concepts in learning order with nav links
- Main area: concept page (React Flow diagram + controls + event log)
- Event log: floating panel, per-page, clears on navigation, auto-scrolls, has a Clear button
- React Flow nodes: Client, Cache, DB — static positions, drag/pan/zoom disabled

## Testing

Unit tests for `internal/cache/` only. The cache interface and in-memory implementation are the non-trivial logic. HTTP handlers and SSE plumbing are thin wrappers — skip testing those.

Run tests:
```bash
go test ./internal/cache/...
```
