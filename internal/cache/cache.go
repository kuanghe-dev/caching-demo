package cache

import (
	"context"
	"time"
)

// Cache is the interface for a key/value cache with TTL support.
type Cache interface {
	// Get retrieves a value by key. Returns ("", false, nil) on a miss or expired entry.
	Get(ctx context.Context, key string) (string, bool, error)

	// Set stores a value with the given TTL. A zero TTL means the entry never expires.
	Set(ctx context.Context, key string, value string, ttl time.Duration) error

	// Delete removes a key. It is a no-op if the key does not exist.
	Delete(ctx context.Context, key string) error

	// Flush removes all entries from the cache.
	Flush(ctx context.Context) error
}
