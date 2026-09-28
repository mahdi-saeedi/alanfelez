package live

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// Heartbeat keeps proxies from closing idle streams (API_GUIDELINES §8).
const Heartbeat = 25 * time.Second

// Viewer decides what the caller may see. It runs once per stream (visibility is fixed while it's open).
// seeAll=false means base series only (free tier).
type Viewer func(r *http.Request) (seeAll bool, err error)

// Snapshot returns the current latest price of every active series.
type Snapshot func(ctx context.Context) ([]prices.Event, error)

// Handler serves GET /v1/prices/stream.
func (h *Hub) Handler(viewer Viewer, snapshot Snapshot, onError func(http.ResponseWriter, *http.Request, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		seeAll, err := viewer(r)
		if err != nil {
			onError(w, r, err)
			return
		}
		only := parseSeries(r.URL.Query().Get("series"))
		filter := func(ev prices.Event) bool {
			if !seeAll && !ev.IsBase {
				return false // locked data is never sent (ADR-0010)
			}
			return only == nil || only[ev.Series]
		}
		// Subscribe before reading the snapshot, so no event falls between the two.
		c := h.subscribe(filter)
		defer h.unsubscribe(c)

		snap, err := snapshot(r.Context())
		if err != nil {
			onError(w, r, err)
			return
		}

		rc := http.NewResponseController(w)
		hd := w.Header()
		hd.Set("Content-Type", "text/event-stream")
		hd.Set("Cache-Control", "no-cache, no-transform")
		hd.Set("X-Accel-Buffering", "no") // nginx / ingress: don't buffer the stream
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprint(w, "retry: 5000\n\n")
		for _, ev := range snap {
			if filter(ev) {
				writeEvent(w, ev)
			}
		}
		if err := rc.Flush(); err != nil {
			return
		}

		tick := time.NewTicker(Heartbeat)
		defer tick.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case ev, ok := <-c.ch:
				if !ok {
					return // dropped (slow) or shutting down: the browser reconnects
				}
				writeEvent(w, ev)
			case <-tick.C:
				_, _ = fmt.Fprint(w, ": ping\n\n")
			}
			if err := rc.Flush(); err != nil {
				return
			}
		}
	}
}

// wireEvent is the PriceEvent schema in contracts/openapi.yaml.
type wireEvent struct {
	Series     string      `json:"series"`
	Price      wirePrice   `json:"price"`
	Change     *wireChange `json:"change,omitempty"`
	ObservedAt time.Time   `json:"observedAt"`
}

type wirePrice struct {
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
	Unit     string `json:"unit"`
}

type wireChange struct {
	Amount string `json:"amount"`
	Bp     int64  `json:"bp"`
}

func writeEvent(w http.ResponseWriter, ev prices.Event) {
	we := wireEvent{
		Series:     ev.Series,
		Price:      wirePrice{Amount: strconv.FormatInt(ev.Price, 10), Currency: ev.Currency, Unit: ev.Unit},
		ObservedAt: ev.ObservedAt,
	}
	if ch, ok := prices.ChangeFrom(ev.PrevClose, ev.Price); ok {
		we.Change = &wireChange{Amount: strconv.FormatInt(ch.Amount, 10), Bp: ch.Bp}
	}
	b, err := json.Marshal(we)
	if err != nil {
		return
	}
	// id lets EventSource send Last-Event-ID; we always re-send a snapshot, so it's informational.
	_, _ = fmt.Fprintf(w, "id: %d\nevent: price\ndata: %s\n\n", ev.PointID, b)
}

// parseSeries turns "a,b" into a set; empty means no filter.
func parseSeries(v string) map[string]bool {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	out := map[string]bool{}
	for _, s := range strings.Split(v, ",") {
		if s = strings.TrimSpace(s); s != "" && len(out) < 100 {
			out[s] = true
		}
	}
	return out
}
