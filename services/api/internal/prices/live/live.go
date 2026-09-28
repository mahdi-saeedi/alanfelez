// Package live fans published prices out to browsers over Server-Sent Events (ADR-0006).
//
//	worker / admin write ──► Publisher: PUBLISH prices:updates ──► every API replica's Hub ──► SSE clients
//
// Redis pub/sub is fire-and-forget. That's fine here: on (re)connect every client first gets a snapshot of the
// current prices from Postgres, so a missed message is repaired by the next reconnect or the next price.
package live

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/redis/go-redis/v9"

	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// Channel is the Redis pub/sub channel for price events (DATA_MODEL §3).
const Channel = "prices:updates"

// Publisher sends events to Redis. It implements prices.Publisher.
type Publisher struct{ rdb *redis.Client }

// NewPublisher returns a Redis publisher.
func NewPublisher(rdb *redis.Client) *Publisher { return &Publisher{rdb: rdb} }

// Publish sends one message per batch.
func (p *Publisher) Publish(ctx context.Context, events []prices.Event) error {
	b, err := json.Marshal(events)
	if err != nil {
		return fmt.Errorf("live: marshal: %w", err)
	}
	if err := p.rdb.Publish(ctx, Channel, b).Err(); err != nil {
		return fmt.Errorf("live: publish: %w", err)
	}
	return nil
}

// clientBuffer is how many events a slow client may lag behind before it's disconnected (it then reconnects
// and gets a fresh snapshot, which is cheaper than buffering without bound).
const clientBuffer = 256

type client struct {
	ch     chan prices.Event
	filter func(prices.Event) bool
}

// Hub subscribes to Redis once per process and fans events out to connected clients.
type Hub struct {
	rdb *redis.Client
	log *slog.Logger

	mu      sync.Mutex
	clients map[*client]struct{}
}

// NewHub creates a hub. Call Run to start receiving.
func NewHub(rdb *redis.Client, log *slog.Logger) *Hub {
	return &Hub{rdb: rdb, log: log, clients: map[*client]struct{}{}}
}

// Run receives from Redis until ctx is cancelled. go-redis re-subscribes by itself after a connection loss.
func (h *Hub) Run(ctx context.Context) {
	sub := h.rdb.Subscribe(ctx, Channel)
	defer func() { _ = sub.Close() }()
	msgs := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			h.closeAll()
			return
		case m, ok := <-msgs:
			if !ok {
				return
			}
			var events []prices.Event
			if err := json.Unmarshal([]byte(m.Payload), &events); err != nil {
				h.log.WarnContext(ctx, "live: bad message", "err", err)
				continue
			}
			h.broadcast(events)
		}
	}
}

func (h *Hub) broadcast(events []prices.Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if !deliver(c, events) { // too slow: drop the client, it will reconnect and re-sync
			delete(h.clients, c)
			close(c.ch)
		}
	}
}

// deliver queues the events c wants without blocking. It returns false when c's buffer is full.
func deliver(c *client, events []prices.Event) bool {
	for _, ev := range events {
		if !c.filter(ev) {
			continue
		}
		select {
		case c.ch <- ev:
		default:
			return false
		}
	}
	return true
}

// subscribe registers a client. The returned channel is closed when the hub drops the client or stops.
func (h *Hub) subscribe(filter func(prices.Event) bool) *client {
	c := &client{ch: make(chan prices.Event, clientBuffer), filter: filter}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	return c
}

func (h *Hub) unsubscribe(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.ch)
	}
}

func (h *Hub) closeAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		close(c.ch)
	}
	h.clients = map[*client]struct{}{}
}

// Clients returns the number of connected clients (metrics, tests).
func (h *Hub) Clients() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}
