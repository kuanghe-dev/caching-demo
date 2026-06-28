package db

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

const (
	defaultLatency = 300 * time.Millisecond
	minLatency     = 100 * time.Millisecond
	maxLatency     = 2000 * time.Millisecond
)

// Product represents a single product record.
type Product struct {
	Name  string  `json:"name"`
	Price float64 `json:"price"`
}

// DB is a simulated database with configurable artificial latency.
type DB struct {
	mu      sync.RWMutex
	latency time.Duration
	data    map[string]Product
}

// New returns a DB pre-populated with 10 fixed products and a default latency of 300 ms.
func New() *DB {
	return &DB{
		latency: defaultLatency,
		data: map[string]Product{
			"product:1":  {Name: "Wireless Headphones", Price: 79.99},
			"product:2":  {Name: "Mechanical Keyboard", Price: 129.99},
			"product:3":  {Name: "USB-C Hub", Price: 49.99},
			"product:4":  {Name: "Webcam HD", Price: 89.99},
			"product:5":  {Name: "Monitor Stand", Price: 39.99},
			"product:6":  {Name: "Desk Mat", Price: 24.99},
			"product:7":  {Name: "LED Desk Lamp", Price: 34.99},
			"product:8":  {Name: "Cable Management Kit", Price: 19.99},
			"product:9":  {Name: "Laptop Stand", Price: 44.99},
			"product:10": {Name: "Ergonomic Mouse", Price: 59.99},
		},
	}
}

// SetLatency changes the simulated fetch latency. Values outside [100ms, 2000ms] are clamped.
func (d *DB) SetLatency(latency time.Duration) {
	if latency < minLatency {
		latency = minLatency
	}
	if latency > maxLatency {
		latency = maxLatency
	}

	d.mu.Lock()
	d.latency = latency
	d.mu.Unlock()
}

// Get returns a JSON-encoded product for the given key after blocking for the configured
// latency. Returns an error if the key does not exist or if ctx is cancelled.
func (d *DB) Get(ctx context.Context, key string) (string, error) {
	d.mu.RLock()
	latency := d.latency
	product, ok := d.data[key]
	d.mu.RUnlock()

	if !ok {
		return "", fmt.Errorf("db: key %q not found", key)
	}

	select {
	case <-time.After(latency):
	case <-ctx.Done():
		return "", ctx.Err()
	}

	b, err := json.Marshal(product)
	if err != nil {
		return "", fmt.Errorf("db: marshal product: %w", err)
	}
	return string(b), nil
}

// Set overwrites the value for an existing key. Returns an error for unknown keys.
func (d *DB) Set(ctx context.Context, key, value string) error {
	var p Product
	if err := json.Unmarshal([]byte(value), &p); err != nil {
		return fmt.Errorf("db: unmarshal value: %w", err)
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	if _, ok := d.data[key]; !ok {
		return fmt.Errorf("db: key %q not found", key)
	}
	d.data[key] = p
	return nil
}
