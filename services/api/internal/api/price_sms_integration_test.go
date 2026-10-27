//go:build integration

package api_test

import (
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/alerts"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

func TestGoldPriceSMS(t *testing.T) {
	e := setup(t)
	e.seedPrices() // copper-red-free 6,464,000 (prev close 6,400,000), copper-lme, copper-cable-free

	// Settings: Gold only; the metal must exist.
	if st, body, _ := e.call(http.MethodPut, "/v1/me/sms-settings", "user", map[string]any{"metal": "copper", "enabled": true}); st != 403 || body["code"] != "FEATURE_LOCKED" {
		t.Fatalf("free user: %d %v", st, body)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/me/sms-settings", "", map[string]any{"metal": "copper", "enabled": true}); st != 401 {
		t.Fatalf("anonymous: %d", st)
	}
	e.grantGold()
	if st, _, _ := e.call(http.MethodPut, "/v1/me/sms-settings", "gold", map[string]any{"metal": "gold-bar", "enabled": true}); st != 400 {
		t.Fatalf("unknown metal: %d", st)
	}
	if st, body, raw := e.call(http.MethodPut, "/v1/me/sms-settings", "gold", map[string]any{"metal": "copper", "enabled": true}); st != 200 || body["metal"] != "copper" || body["allowed"] != true {
		t.Fatalf("save: %d %s", st, raw)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/me/sms-settings", "user", nil); body["allowed"] != false || body["metal"] != nil {
		t.Fatalf("free user's settings: %v", body)
	}
	// A user who chose copper but has no Gold gets nothing.
	e.call(http.MethodGet, "/v1/me", "silver", nil)
	if _, err := e.pool.Exec(t.Context(), `INSERT INTO app.sms_prefs (user_id, metal_id) SELECT '00000000-0000-0000-0000-000000000002', id FROM market.metals WHERE slug = 'copper'`); err != nil {
		t.Fatal(err)
	}

	sms := &fakeSMS{}
	svc := alerts.NewService(e.pool, sms, "https://alanfelez.ir", slog.New(slog.NewTextHandler(io.Discard, nil)))
	// Tomorrow 12:00 Tehran: outside the night pause, and long after the last change.
	noon := func(days int) time.Time {
		y, m, d := time.Now().In(prices.Tehran).AddDate(0, 0, days).Date()
		return time.Date(y, m, d, 12, 0, 0, 0, prices.Tehran)
	}
	if n, err := svc.AutoAt(t.Context(), noon(1)); err != nil || n != 0 { // first run: cursors start now, old changes aren't news
		t.Fatalf("first run: %d %v %v", n, err, sms.sent)
	}
	if n, _ := svc.AutoAt(t.Context(), noon(1).Add(-14*time.Hour)); n != 0 { // 22:00: night pause
		t.Fatal("sent during the night pause")
	}

	// Staff change two copper prices (one of them +12 % against yesterday) and the global copper price.
	src, _ := dbq.New(e.pool).GetSourceBySlug(t.Context(), "test")
	now := time.Now().UTC().Truncate(time.Second)
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, []prices.Quote{
		{Series: "copper-red-free", ObservedAt: now, Price: 7_168_000},
		{Series: "copper-cable-free", ObservedAt: now, Price: 7_150_000},
		{Series: "copper-lme", ObservedAt: now, Price: 1_200_000},
	}, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	n, err := svc.AutoAt(t.Context(), noon(1))
	if err != nil || n != 2 {
		t.Fatalf("batch: %d %v %v", n, err, sms.sent)
	}
	all := strings.Join(sms.sent, "\n")
	if !strings.Contains(all, "+989120000003 price_update") || !strings.Contains(all, "فلز: مس") || !strings.Contains(all, "تعداد محصولات: ۲") {
		t.Fatalf("update SMS (2 domestic products, not the global one): %s", all)
	}
	if !strings.Contains(all, "+989120000003 price_alert") || !strings.Contains(all, "+۱۲٫۰۰٪") || strings.Contains(all, "+989120000002") {
		t.Fatalf("move alert to Gold only: %s", all)
	}
	if n, _ := svc.AutoAt(t.Context(), noon(1)); n != 0 {
		t.Fatalf("second run sent %d", n)
	}

	// Turned off: nothing more, even for a new change.
	e.call(http.MethodPut, "/v1/me/sms-settings", "gold", map[string]any{"metal": "copper", "enabled": false})
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, []prices.Quote{{Series: "copper-cable-free", ObservedAt: now.Add(time.Second), Price: 7_160_000}}, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	if n, _ := svc.AutoAt(t.Context(), noon(1)); n != 0 {
		t.Fatalf("sent while off: %v", sms.sent)
	}
}
