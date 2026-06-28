# Caching Demo

An interactive demo that helps developers understand caching concepts through real-time visualization.

## Concepts Covered

1. **Cache Hit / Miss** — see the speed difference between a cache hit and a database fetch
2. **TTL (Time-to-Live)** — watch cache entries expire in real time
3. **Cache Invalidation** — observe stale data being served, and how invalidation fixes it
4. **Population Strategies** — compare Cache-Aside, Read-Through, and Write-Through side by side
5. **Thundering Herd** — simulate N concurrent requests hitting an empty cache, then see singleflight coalescing solve it

## Running the Demo

### Prerequisites

- Go 1.22+
- Node 20+

### Development

```bash
# Terminal 1: start the Go backend on :8080
go run ./cmd/server

# Terminal 2: start the Vite dev server on :5173
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` and `/events` to the Go backend.

### Production (single binary)

```bash
cd frontend && npm run build
cd .. && go build -o caching-demo ./cmd/server
./caching-demo
```

Open [http://localhost:8080](http://localhost:8080).

## Simulated Dataset

The demo uses a fixed dataset of 10 products (`product:1` through `product:10`). The simulated database has a configurable artificial latency (default 300ms) to make the cache hit/miss speed difference visible.

## Controls

| Control | Description |
|---|---|
| DB Latency slider | Artificial delay on database fetches (100ms–2000ms) |
| TTL slider | How long cache entries live (5s–60s) |
| Speed multiplier | Compress time to see TTL expiry faster (1x / 5x / 10x) |
| N slider (Thundering Herd) | Number of concurrent requests to fire |
| Singleflight toggle | Enable/disable request coalescing on the thundering herd page |
