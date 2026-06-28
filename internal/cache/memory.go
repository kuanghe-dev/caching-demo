package cache

import (
	"context"
	"sync"
	"time"
)

type entry struct {
	value     string
	expiresAt time.Time // zero value means no expiry
}

func (e *entry) expired() bool {
	return !e.expiresAt.IsZero() && time.Now().After(e.expiresAt)
}

// MemoryCache is a thread-safe in-memory implementation of Cache with lazy TTL expiry.
type MemoryCache struct {
	mu    sync.RWMutex
	items map[string]*entry
}

// NewMemoryCache returns an initialised MemoryCache.
func NewMemoryCache() *MemoryCache {
	return &MemoryCache{
		items: make(map[string]*entry),
	}
}

// Get returns the cached value for key. Returns ("", false, nil) on a miss or if the
// entry has expired.
func (c *MemoryCache) Get(_ context.Context, key string) (string, bool, error) {
	c.mu.RLock()
	e, ok := c.items[key]
	c.mu.RUnlock()

	if !ok || e.expired() {
		return "", false, nil
	}
	return e.value, true, nil
}

// Set stores value under key with the given TTL. A zero TTL means the entry never expires.
func (c *MemoryCache) Set(_ context.Context, key string, value string, ttl time.Duration) error {
	e := &entry{value: value}
	if ttl > 0 {
		e.expiresAt = time.Now().Add(ttl)
	}

	c.mu.Lock()
	c.items[key] = e
	c.mu.Unlock()
	return nil
}

// Delete removes a key. It is a no-op if the key does not exist.
func (c *MemoryCache) Delete(_ context.Context, key string) error {
	c.mu.Lock()
	delete(c.items, key)
	c.mu.Unlock()
	return nil
}

// SnapshotEntry is a single cache entry returned by Snapshot.
type SnapshotEntry struct {
	Key       string
	Value     string
	ExpiresAt time.Time
}

// Snapshot returns all non-expired entries in the cache.
func (c *MemoryCache) Snapshot() []SnapshotEntry {
	now := time.Now()
	c.mu.RLock()
	defer c.mu.RUnlock()

	entries := make([]SnapshotEntry, 0, len(c.items))
	for k, e := range c.items {
		if !e.expiresAt.IsZero() && now.After(e.expiresAt) {
			continue // lazily skip expired entries
		}
		entries = append(entries, SnapshotEntry{
			Key:       k,
			Value:     e.value,
			ExpiresAt: e.expiresAt,
		})
	}
	return entries
}
