package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kuanghe-dev/caching-demo/internal/cache"
	"github.com/kuanghe-dev/caching-demo/internal/db"
	"github.com/kuanghe-dev/caching-demo/internal/sse"
)

// config holds the mutable runtime configuration.
type config struct {
	LatencyMs       int `json:"latencyMs"`
	TtlMs           int `json:"ttlMs"`
	SpeedMultiplier int `json:"speedMultiplier"`
}

// Handler holds all dependencies and serves the REST + SSE API.
type Handler struct {
	cache  cache.Cache
	db     *db.DB
	broker *sse.Broker

	mu  sync.Mutex
	cfg config
}

// New returns a Handler with sensible defaults.
func New(c cache.Cache, d *db.DB, b *sse.Broker) *Handler {
	return &Handler{
		cache:  c,
		db:     d,
		broker: b,
		cfg: config{
			LatencyMs:       300,
			TtlMs:           30000,
			SpeedMultiplier: 1,
		},
	}
}

// ---------- helpers ----------

func (h *Handler) actualTTL() time.Duration {
	h.mu.Lock()
	defer h.mu.Unlock()
	ms := h.cfg.TtlMs / h.cfg.SpeedMultiplier
	return time.Duration(ms) * time.Millisecond
}

func (h *Handler) actualTTLMs() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.cfg.TtlMs / h.cfg.SpeedMultiplier
}

// cacheStateEvent builds a cache_state event by iterating all known keys.
// Because MemoryCache uses lazy expiry we call Get per key; expired entries come back false.
func (h *Handler) cacheStateEvent(ctx context.Context) map[string]any {
	mc, ok := h.cache.(*cache.MemoryCache)
	if !ok {
		return map[string]any{"type": "cache_state", "entries": []any{}}
	}

	entries := mc.Snapshot()
	result := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		result = append(result, map[string]any{
			"key":       e.Key,
			"value":     e.Value,
			"expiresAt": e.ExpiresAt.UnixMilli(),
		})
	}
	return map[string]any{"type": "cache_state", "entries": result}
}

// watchExpiry starts a goroutine that fires a cache_expire event when key expires.
func (h *Handler) watchExpiry(ctx context.Context, key string, ttl time.Duration) {
	go func() {
		select {
		case <-time.After(ttl):
		case <-ctx.Done():
			return
		}
		// Lazy-expiry: if Get returns a miss, the key has expired.
		_, hit, err := h.cache.Get(ctx, key)
		if err != nil || hit {
			return // still live (re-set) or context cancelled
		}
		h.broker.Publish(map[string]any{"type": "cache_expire", "key": key})
	}()
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// ---------- SSE ----------

// Events streams SSE events to the client.
func (h *Handler) Events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := h.broker.Subscribe()
	defer h.broker.Unsubscribe(ch)

	// Send initial state immediately.
	state := h.cacheStateEvent(r.Context())
	if data, err := json.Marshal(state); err == nil {
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	for {
		select {
		case <-r.Context().Done():
			return
		case data, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}

// ---------- GET /api/products/:id ----------

// GetProduct implements cache-aside read.
func (h *Handler) GetProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	key := "product:" + id
	ctx := r.Context()

	value, hit, err := h.cache.Get(ctx, key)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if hit {
		h.broker.Publish(map[string]any{"type": "cache_hit", "key": key, "value": value})
		h.broker.Publish(h.cacheStateEvent(ctx))
		writeJSON(w, http.StatusOK, json.RawMessage(value))
		return
	}

	// Cache miss — fetch from DB.
	h.broker.Publish(map[string]any{"type": "cache_miss", "key": key})

	start := time.Now()
	value, err = h.db.Get(ctx, key)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	latencyMs := time.Since(start).Milliseconds()
	h.broker.Publish(map[string]any{"type": "db_fetch", "key": key, "latencyMs": latencyMs})

	ttl := h.actualTTL()
	ttlMs := h.actualTTLMs()
	if err := h.cache.Set(ctx, key, value, ttl); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.broker.Publish(map[string]any{"type": "cache_set", "key": key, "value": value, "ttlMs": ttlMs})
	h.broker.Publish(h.cacheStateEvent(ctx))

	// Start expiry watcher using a background context so it outlives the request.
	h.watchExpiry(context.Background(), key, ttl)

	writeJSON(w, http.StatusOK, json.RawMessage(value))
}

// ---------- POST /api/products/:id ----------

// UpdateProduct writes a new value to the DB and optionally invalidates the cache.
func (h *Handler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	key := "product:" + id
	ctx := r.Context()

	var body struct {
		Value      string `json:"value"`
		Invalidate bool   `json:"invalidate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if err := h.db.Set(ctx, key, body.Value); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if body.Invalidate {
		if err := h.cache.Delete(ctx, key); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		h.broker.Publish(map[string]any{"type": "cache_delete", "key": key})
		h.broker.Publish(h.cacheStateEvent(ctx))
	}

	writeJSON(w, http.StatusOK, json.RawMessage(body.Value))
}

// ---------- GET /api/config ----------

// GetConfig returns the current runtime configuration.
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	cfg := h.cfg
	h.mu.Unlock()
	writeJSON(w, http.StatusOK, cfg)
}

// ---------- POST /api/config ----------

// UpdateConfig updates one or more config fields.
func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LatencyMs       *int `json:"latencyMs"`
		TtlMs           *int `json:"ttlMs"`
		SpeedMultiplier *int `json:"speedMultiplier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	h.mu.Lock()
	if body.LatencyMs != nil {
		h.cfg.LatencyMs = *body.LatencyMs
	}
	if body.TtlMs != nil {
		h.cfg.TtlMs = *body.TtlMs
	}
	if body.SpeedMultiplier != nil {
		if *body.SpeedMultiplier == 1 || *body.SpeedMultiplier == 5 || *body.SpeedMultiplier == 10 {
			h.cfg.SpeedMultiplier = *body.SpeedMultiplier
		}
	}
	latencyMs := h.cfg.LatencyMs
	h.mu.Unlock()

	h.db.SetLatency(time.Duration(latencyMs) * time.Millisecond)

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
