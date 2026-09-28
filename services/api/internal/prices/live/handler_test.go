package live

import (
	"bufio"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

func ev(series string, base bool, price int64) prices.Event {
	return prices.Event{PointID: price, Series: series, IsBase: base, Currency: "IRR", Unit: "kg", Price: price, ObservedAt: time.Unix(0, 0).UTC()}
}

// stream opens the SSE handler and returns a reader over its body.
func stream(t *testing.T, h *Hub, seeAll bool, query string) *bufio.Reader {
	t.Helper()
	snap := func(context.Context) ([]prices.Event, error) {
		return []prices.Event{ev("base-a", true, 100), ev("paid-b", false, 200)}, nil
	}
	srv := httptest.NewServer(h.Handler(func(*http.Request) (bool, error) { return seeAll, nil }, snap,
		func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(500) }))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithCancel(t.Context())
	t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+query, nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = res.Body.Close() })
	if ct := res.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	return bufio.NewReader(res.Body)
}

// next returns the next event's data line.
func next(t *testing.T, r *bufio.Reader) string {
	t.Helper()
	done := make(chan string, 1)
	go func() {
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				done <- ""
				return
			}
			if data, ok := strings.CutPrefix(line, "data: "); ok {
				done <- strings.TrimSpace(data)
				return
			}
		}
	}()
	select {
	case d := <-done:
		return d
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for an event")
		return ""
	}
}

func waitClients(t *testing.T, h *Hub, n int) {
	t.Helper()
	for i := 0; i < 100 && h.Clients() != n; i++ {
		time.Sleep(10 * time.Millisecond)
	}
	if h.Clients() != n {
		t.Fatalf("clients = %d, want %d", h.Clients(), n)
	}
}

func TestFreeViewerNeverGetsPaidSeries(t *testing.T) {
	h := NewHub(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	r := stream(t, h, false, "")
	if d := next(t, r); !strings.Contains(d, `"series":"base-a"`) {
		t.Fatalf("snapshot: %s", d)
	}
	waitClients(t, h, 1)
	h.broadcast([]prices.Event{ev("paid-b", false, 201), ev("base-a", true, 101)})
	// The paid event is skipped; the next thing on the wire is the base update.
	if d := next(t, r); !strings.Contains(d, `"amount":"101"`) || strings.Contains(d, "paid-b") {
		t.Fatalf("live: %s", d)
	}
}

func TestPaidViewerAndSeriesFilter(t *testing.T) {
	h := NewHub(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	r := stream(t, h, true, "?series=paid-b")
	if d := next(t, r); !strings.Contains(d, `"series":"paid-b"`) {
		t.Fatalf("snapshot must honour ?series: %s", d)
	}
	waitClients(t, h, 1)
	h.broadcast([]prices.Event{ev("base-a", true, 102), ev("paid-b", false, 202)})
	if d := next(t, r); !strings.Contains(d, `"amount":"202"`) {
		t.Fatalf("live: %s", d)
	}
}

func TestSlowClientIsDropped(t *testing.T) {
	h := NewHub(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	c := h.subscribe(func(prices.Event) bool { return true })
	batch := make([]prices.Event, clientBuffer+1)
	for i := range batch {
		batch[i] = ev("base-a", true, int64(i))
	}
	h.broadcast(batch)
	if h.Clients() != 0 {
		t.Fatal("a client whose buffer overflowed must be dropped")
	}
	n := 0
	for range c.ch {
		n++
	}
	if n != clientBuffer {
		t.Fatalf("drained %d events, want %d before close", n, clientBuffer)
	}
}
