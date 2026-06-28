package sse

import (
	"encoding/json"
	"sync"
)

// Broker fan-outs SSE events to all connected clients.
type Broker struct {
	mu      sync.Mutex
	clients map[chan []byte]struct{}
}

// NewBroker returns an initialised Broker.
func NewBroker() *Broker {
	return &Broker{
		clients: make(map[chan []byte]struct{}),
	}
}

// Subscribe registers a new client and returns a buffered channel that will receive
// JSON-encoded event payloads.
func (b *Broker) Subscribe() chan []byte {
	ch := make(chan []byte, 16)
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

// Unsubscribe removes a client channel and closes it after draining.
func (b *Broker) Unsubscribe(ch chan []byte) {
	b.mu.Lock()
	delete(b.clients, ch)
	b.mu.Unlock()

	// Drain then close so the HTTP handler's range loop exits cleanly.
	for len(ch) > 0 {
		<-ch
	}
	close(ch)
}

// Publish JSON-encodes event and sends it to every connected client. Slow clients
// whose buffers are full are skipped (non-blocking send).
func (b *Broker) Publish(event any) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.clients {
		select {
		case ch <- data:
		default:
			// Drop event for a slow client rather than blocking everyone.
		}
	}
}
