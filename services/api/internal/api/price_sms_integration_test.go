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
	e.seedPrices() // copper-red-free 6,464,000 (prev close 6,400,000), copper-lme, copper-telecom-free

	// Settings: Gold only (the switch; the metals are bought at checkout).
	if st, body, _ := e.call(http.MethodPut, "/v1/me/sms-settings", "user", map[string]any{"enabled": true}); st != 403 || body["code"] != "FEATURE_LOCKED" {
		t.Fatalf("free user: %d %v", st, body)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/me/sms-settings", "", map[string]any{"enabled": true}); st != 401 {
		t.Fatalf("anonymous: %d", st)
	}
	e.grantGold()
	// Gold without paid metals: the "choose your metals" notice, for 7 days, and the price of adding one (a 30-day
	// grant = 1 month = 100,000 Toman).
	if _, body, raw := e.call(http.MethodGet, "/v1/me/sms-settings", "gold", nil); body["allowed"] != true || body["chooseUntil"] == nil || body["addMetalPrice"].(map[string]any)["amount"] != "1000000" {
		t.Fatalf("notice: %s", raw)
	}
	// Copper paid for on the Gold subscription (as a checkout would).
	if _, err := e.pool.Exec(t.Context(), `INSERT INTO app.subscription_sms_metals (subscription_id, metal_id)
		SELECT s.id, m.id FROM app.subscriptions s, market.metals m WHERE s.user_id = '00000000-0000-0000-0000-000000000003' AND m.slug = 'copper'`); err != nil {
		t.Fatal(err)
	}
	if st, body, raw := e.call(http.MethodPut, "/v1/me/sms-settings", "gold", map[string]any{"enabled": true}); st != 200 || len(body["metals"].([]any)) != 1 || body["metals"].([]any)[0] != "copper" || body["allowed"] != true || body["chooseUntil"] != nil || body["phone"] != "+989120000003" {
		t.Fatalf("save: %d %s", st, raw)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/me/sms-settings", "user", nil); body["allowed"] != false || len(body["metals"].([]any)) != 0 || body["chooseUntil"] != nil {
		t.Fatalf("free user's settings: %v", body)
	}
	// A user whose copper is on a Silver subscription gets nothing.
	e.call(http.MethodGet, "/v1/me", "silver", nil)
	if _, err := e.pool.Exec(t.Context(), `WITH s AS (INSERT INTO app.subscriptions (user_id, plan_code, ends_at) VALUES ('00000000-0000-0000-0000-000000000002', 'silver', now() + interval '30 days') RETURNING id)
		INSERT INTO app.subscription_sms_metals (subscription_id, metal_id) SELECT s.id, m.id FROM s, market.metals m WHERE m.slug = 'copper'`); err != nil {
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

	// Staff move one copper price +12 % against yesterday and change the global copper price: the move alert goes out,
	// and no "prices updated" for the same change (the global price never counts).
	src, _ := dbq.New(e.pool).GetSourceBySlug(t.Context(), "test")
	now := time.Now().UTC().Truncate(time.Second)
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, []prices.Quote{
		{Series: "copper-red-free", ObservedAt: now, Price: 7_168_000},
		{Series: "copper-lme", ObservedAt: now, Price: 1_200_000},
	}, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	n, err := svc.AutoAt(t.Context(), noon(1))
	all := strings.Join(sms.sent, "\n")
	if err != nil || n != 1 || !strings.Contains(all, "+989120000003 price_alert") || !strings.Contains(all, "+۱۲٫۰۰٪") || strings.Contains(all, "+989120000002") {
		t.Fatalf("move alert to Gold only, no update SMS: %d %v %s", n, err, all)
	}

	// Another copper product changes: "prices updated" counts only it.
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, []prices.Quote{{Series: "copper-telecom-free", ObservedAt: now, Price: 7_150_000}}, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	if n, err = svc.AutoAt(t.Context(), noon(1)); err != nil || n != 1 {
		t.Fatalf("batch: %d %v %v", n, err, sms.sent)
	}
	all = strings.Join(sms.sent, "\n")
	if !strings.Contains(all, "+989120000003 price_update") || !strings.Contains(all, "فلز: مس") || !strings.Contains(all, "تعداد محصولات: ۱") {
		t.Fatalf("update SMS (1 product, not the one already alerted): %s", all)
	}
	if n, _ := svc.AutoAt(t.Context(), noon(1)); n != 0 {
		t.Fatalf("second run sent %d", n)
	}

	// IME (client, 2026-11-04): zinc ticked at sign-up only → the IME "updated" SMS; aluminium ticked nowhere → nothing.
	if _, err := e.pool.Exec(t.Context(), `UPDATE app.users SET metals = '{zinc}' WHERE id = '00000000-0000-0000-0000-000000000003'`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, []prices.Quote{
		{Series: "zinc-ingot-ime", ObservedAt: now, Price: 1_700_000},
		{Series: "aluminum-ingot-ime", ObservedAt: now, Price: 2_150_000},
	}, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	before := len(sms.sent)
	if n, err = svc.AutoAt(t.Context(), noon(1)); err != nil || n != 1 {
		t.Fatalf("IME batch: %d %v %v", n, err, sms.sent[before:])
	}
	if got := sms.sent[len(sms.sent)-1]; !strings.Contains(got, "+989120000003 ime_update") || !strings.Contains(got, "بورس کالا") || !strings.Contains(got, "فلز: روی") {
		t.Fatalf("IME SMS: %s", got)
	}

	// The member's daily limit (client, 2026-11-04: 50,000 Toman by default): spent → nothing more that day.
	for _, q := range []string{
		`INSERT INTO app.site_settings (key, value) VALUES ('sms', '{"per_user_daily_rial": 1000}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
		`INSERT INTO app.notifications (user_id, channel, template, recipient, body, status, provider, cost_rial, dedupe_key, created_at)
		 VALUES ('00000000-0000-0000-0000-000000000003', 'sms', 'price_move', '+989120000003', 'x', 'sent', 'fake', 5000, 'limit-test', $1)`,
	} {
		var args []any
		if strings.Contains(q, "$1") {
			args = append(args, noon(1))
		}
		if _, err := e.pool.Exec(t.Context(), q, args...); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, []prices.Quote{{Series: "copper-telecom-free", ObservedAt: now.Add(500 * time.Millisecond), Price: 7_155_000}}, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	if n, _ := svc.AutoAt(t.Context(), noon(1)); n != 0 {
		t.Fatalf("sent over the member's limit: %v", sms.sent)
	}
	if _, err := e.pool.Exec(t.Context(), `DELETE FROM app.notifications WHERE dedupe_key = 'limit-test'`); err != nil {
		t.Fatal(err)
	}

	// Turned off: nothing more, even for a new change.
	e.call(http.MethodPut, "/v1/me/sms-settings", "gold", map[string]any{"enabled": false})
	if _, err := e.prices.Ingest(t.Context(), prices.Origin{SourceID: src.ID}, []prices.Quote{{Series: "copper-telecom-free", ObservedAt: now.Add(time.Second), Price: 7_160_000}}, prices.IngestOptions{}); err != nil {
		t.Fatal(err)
	}
	if n, _ := svc.AutoAt(t.Context(), noon(1)); n != 0 {
		t.Fatalf("sent while off: %v", sms.sent)
	}

	// The admin's SMS log shows them, with the user's name; the failed filter has none.
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/notifications", "user", nil); st != 403 {
		t.Fatalf("SMS log for a user: %d", st)
	}
	_, body, raw := e.call(http.MethodGet, "/v1/admin/notifications", "support", nil)
	items := body["items"].([]any)
	first := items[len(items)-1].(map[string]any)
	if len(items) != len(sms.sent) || first["template"] != "price_move" || first["user"] != "Gol Test" || first["status"] != "sent" {
		t.Fatalf("SMS log: %s", raw)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/admin/notifications?status=failed", "support", nil); len(body["items"].([]any)) != 0 {
		t.Fatal("failed filter")
	}
}
