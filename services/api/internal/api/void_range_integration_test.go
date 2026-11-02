//go:build integration

package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// Bulk void (client, 2026-11-02): a whole price row, or one period of it, in one go; audited once.
func TestVoidSeriesRange(t *testing.T) {
	e := setup(t)
	e.seedPrices()
	src, _ := dbq.New(e.pool).GetSourceBySlug(t.Context(), "test")
	day := time.Now().UTC().Truncate(time.Hour)
	var quotes []prices.Quote
	for d := 4; d >= 0; d-- { // brass world price, five days
		quotes = append(quotes, prices.Quote{Series: "brass-yellow-global", ObservedAt: day.Add(-time.Duration(d) * 24 * time.Hour), Price: int64(680_000 + d*1000)})
	}
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, quotes, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	path := "/v1/admin/series/brass-yellow-global/void"
	published := func() int {
		return e.count(`SELECT count(*) FROM market.price_points p JOIN market.price_series s ON s.id = p.series_id WHERE s.slug = 'brass-yellow-global' AND p.status = 'published'`)
	}
	if st, _, _ := e.call(http.MethodPost, path, "support", map[string]any{}); st != 403 {
		t.Fatalf("support: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/series/nope/void", "editor", map[string]any{}); st != 404 {
		t.Fatalf("unknown row: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, path, "editor", map[string]any{"from": day.Format(time.RFC3339), "to": day.Add(-time.Hour).Format(time.RFC3339)}); st != 400 {
		t.Fatalf("to before from: %d", st)
	}
	// Days -3 and -2 (from day -3 up to, not including, day -1).
	from, to := day.Add(-3*24*time.Hour), day.Add(-1*24*time.Hour)
	if st, b, raw := e.call(http.MethodPost, path, "editor", map[string]any{"from": from.Format(time.RFC3339), "to": to.Format(time.RFC3339), "reason": "آزمایشی"}); st != 200 || b["voided"].(float64) != 2 {
		t.Fatalf("range: %d %s", st, raw)
	}
	if n := published(); n != 3 {
		t.Fatalf("published after range = %d", n)
	}
	// Everything: the row leaves the site.
	if _, b, raw := e.call(http.MethodPost, path, "editor", map[string]any{}); b["voided"].(float64) != 3 {
		t.Fatalf("all: %s", raw)
	}
	if n := e.count(`SELECT count(*) FROM market.price_latest l JOIN market.price_series s ON s.id = l.series_id WHERE s.slug = 'brass-yellow-global'`); n != 0 {
		t.Fatal("latest price kept after voiding everything")
	}
	if _, _, raw := e.call(http.MethodGet, "/v1/prices", "", nil); contains(raw, "brass-yellow-global") {
		t.Fatal("voided row still listed")
	}
	if n := e.auditCount("price.void_range"); n != 2 {
		t.Fatalf("audit rows = %d", n)
	}
	// Nothing left to void: 0, no audit row.
	if _, b, _ := e.call(http.MethodPost, path, "editor", map[string]any{}); b["voided"].(float64) != 0 || e.auditCount("price.void_range") != 2 {
		t.Fatalf("empty void: %v", b)
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
