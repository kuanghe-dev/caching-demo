package cache

import (
	"context"
	"sync"
	"testing"
	"time"
)

func newCache() *MemoryCache {
	return NewMemoryCache()
}

func TestGet_Hit(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	c := newCache()

	if err := c.Set(ctx, "k", "v", 0); err != nil {
		t.Fatalf("Set: %v", err)
	}

	got, ok, err := c.Get(ctx, "k")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !ok {
		t.Fatal("expected hit, got miss")
	}
	if got != "v" {
		t.Fatalf("got %q, want %q", got, "v")
	}
}

func TestGet_Miss(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	c := newCache()

	got, ok, err := c.Get(ctx, "nope")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if ok {
		t.Fatalf("expected miss, got hit with value %q", got)
	}
	if got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}

func TestTTL_Expiry(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	c := newCache()

	if err := c.Set(ctx, "k", "v", 50*time.Millisecond); err != nil {
		t.Fatalf("Set: %v", err)
	}

	// Should still be present immediately after Set.
	_, ok, _ := c.Get(ctx, "k")
	if !ok {
		t.Fatal("entry should be present before TTL elapses")
	}

	time.Sleep(100 * time.Millisecond)

	got, ok, err := c.Get(ctx, "k")
	if err != nil {
		t.Fatalf("Get after expiry: %v", err)
	}
	if ok {
		t.Fatalf("entry should have expired, but got value %q", got)
	}
}

func TestDelete(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	c := newCache()

	if err := c.Set(ctx, "k", "v", 0); err != nil {
		t.Fatalf("Set: %v", err)
	}

	if err := c.Delete(ctx, "k"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, ok, err := c.Get(ctx, "k")
	if err != nil {
		t.Fatalf("Get after delete: %v", err)
	}
	if ok {
		t.Fatal("key should be gone after Delete")
	}
}

func TestDelete_NonExistent(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	c := newCache()

	// Delete on a key that was never Set should not return an error.
	if err := c.Delete(ctx, "ghost"); err != nil {
		t.Fatalf("Delete on non-existent key: %v", err)
	}
}

func TestConcurrentAccess(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	c := newCache()

	const goroutines = 50
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := range goroutines {
		go func(i int) {
			defer wg.Done()
			key := "key"
			_ = c.Set(ctx, key, "value", time.Second)
			_, _, _ = c.Get(ctx, key)
			if i%5 == 0 {
				_ = c.Delete(ctx, key)
			}
		}(i)
	}

	wg.Wait()
}
