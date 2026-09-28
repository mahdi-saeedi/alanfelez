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
)

func offering(date, product string, traded bool) map[string]any {
	o := map[string]any{
		"tradeDate": date, "metal": "copper", "productFa": product, "producerFa": "ملی مس",
		"offeredKg": 100000, "basePriceRial": 6000000,
	}
	if traded {
		o["demandKg"], o["tradedKg"], o["clearingPriceRial"] = 250000, 100000, 6300000
	}
	return o
}

func TestAuctionsTeaserAndGold(t *testing.T) {
	e := setup(t)
	today := time.Now().Format(time.DateOnly)
	rows := []any{offering(today, "کاتد مس", true), offering(today, "مفتول مس", false)}

	// Dry run and an invalid row save nothing.
	if st, body, raw := e.call(http.MethodPost, "/v1/admin/auctions/bulk", "editor", map[string]any{"rows": rows, "dryRun": true}); st != 200 || body["saved"].(float64) != 0 {
		t.Fatalf("dry run: %d %s", st, raw)
	}
	bad := offering(today, "کاتد مس", true)
	bad["tradedKg"] = 200000 // more than offered
	st, body, _ := e.call(http.MethodPost, "/v1/admin/auctions/bulk", "editor", map[string]any{"rows": []any{rows[1], bad}})
	if st != 200 || body["saved"].(float64) != 0 || body["results"].([]any)[1].(map[string]any)["ok"] != false {
		t.Fatalf("invalid row: %d %v", st, body)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/auctions/bulk", "support", map[string]any{"rows": rows}); st != 403 {
		t.Fatalf("support must not enter offerings: %d", st)
	}
	if st, body, raw := e.call(http.MethodPost, "/v1/admin/auctions/bulk", "editor", map[string]any{"rows": rows}); st != 200 || body["saved"].(float64) != 2 {
		t.Fatalf("save: %d %s", st, raw)
	}
	// Re-entering a row corrects it instead of duplicating.
	if _, body, _ := e.call(http.MethodPost, "/v1/admin/auctions/bulk", "editor", map[string]any{"rows": rows[:1]}); body["results"].([]any)[0].(map[string]any)["inserted"] != false {
		t.Fatalf("re-entry must update: %v", body)
	}

	// Everyone: the summary; rows only for Gold.
	st, day, raw := e.call(http.MethodGet, "/v1/auctions", "", nil)
	sum := day["summary"].(map[string]any)
	if st != 200 || day["locked"] != true || day["items"] != nil || sum["offerings"].(float64) != 2 || sum["tradedKg"].(float64) != 100000 || sum["avgChangeBp"].(float64) != 500 {
		t.Fatalf("anonymous: %d %s", st, raw)
	}
	if day["date"] != today || len(day["dates"].([]any)) != 1 || !strings.Contains(day["source"].(string), "بورس") {
		t.Fatalf("dates/source: %v", day)
	}
	e.grantGold()
	st, day, _ = e.call(http.MethodGet, "/v1/auctions?metal=copper&date="+today, "gold", nil)
	items, _ := day["items"].([]any)
	if st != 200 || day["locked"] != false || len(items) != 2 {
		t.Fatalf("gold: %d %v", st, day)
	}
	var traded map[string]any
	for _, it := range items {
		if it.(map[string]any)["product"] == "کاتد مس" {
			traded = it.(map[string]any)
		}
	}
	if traded["changeBp"].(float64) != 500 {
		t.Fatalf("change vs base: %v", traded)
	}
	if n := e.count(`SELECT count(*) FROM app.entitlement_usage WHERE feature = 'auctions.read'`); n != 1 {
		t.Fatalf("usage = %d", n)
	}
	if st, _, _ := e.call(http.MethodDelete, "/v1/admin/auctions/"+traded["id"].(string), "editor", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action LIKE 'ime.%'`); n != 3 {
		t.Fatalf("audit rows = %d", n)
	}
}

func TestCalculator(t *testing.T) {
	e := setup(t)
	e.seedPrices()
	in := map[string]any{"series": "copper-red-free", "weightGrams": 1000000, "impurityBp": 1000, "deductionBp": 0, "shippingRial": 0, "shippingPaidBy": "seller"}

	for _, tok := range []string{"", "silver"} {
		if st, body, _ := e.call(http.MethodPost, "/v1/calculator/estimate", tok, in); st != 403 || body["code"] != "FEATURE_LOCKED" || body["requiredPlan"] != "gold" {
			t.Fatalf("%q: %d %v", tok, st, body)
		}
	}
	e.grantGold()
	st, res, raw := e.call(http.MethodPost, "/v1/calculator/estimate", "gold", in)
	// 1 t × 90 % × 646,400 Toman/kg = 581,760,000 Toman
	if st != 200 || res["valueRial"].(float64) != 5_817_600_000 || res["price"].(map[string]any)["series"] != "copper-red-free" ||
		res["input"].(map[string]any)["unitPriceRialPerKg"].(float64) != 6_464_000 {
		t.Fatalf("series price: %d %s", st, raw)
	}
	in["unitPriceRialPerKg"] = 7_000_000
	if _, res, _ := e.call(http.MethodPost, "/v1/calculator/estimate", "gold", in); res["valueRial"].(float64) != 6_300_000_000 {
		t.Fatalf("manual price overrides: %v", res)
	}
	for name, bad := range map[string]map[string]any{
		"LME series":    {"series": "copper-lme", "weightGrams": 1, "impurityBp": 0, "deductionBp": 0, "shippingRial": 0, "shippingPaidBy": "seller"},
		"no price":      {"weightGrams": 1, "impurityBp": 0, "deductionBp": 0, "shippingRial": 0, "shippingPaidBy": "seller"},
		"impurity 101%": {"unitPriceRialPerKg": 1, "weightGrams": 1, "impurityBp": 10100, "deductionBp": 0, "shippingRial": 0, "shippingPaidBy": "seller"},
	} {
		if st, _, _ := e.call(http.MethodPost, "/v1/calculator/estimate", "gold", bad); st != 400 {
			t.Fatalf("%s: %d", name, st)
		}
	}

	// Saved calculations keep their result.
	st, saved, raw := e.call(http.MethodPost, "/v1/me/calculations", "gold", map[string]any{"name": "بار مس تهران", "input": in})
	if st != 201 || saved["result"].(map[string]any)["valueRial"].(float64) != 6_300_000_000 {
		t.Fatalf("save: %d %s", st, raw)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/me/calculations", "silver", map[string]any{"name": "x", "input": in}); st != 403 {
		t.Fatalf("silver save: %d", st)
	}
	_, list, _ := e.call(http.MethodGet, "/v1/me/calculations", "gold", nil)
	if len(list["items"].([]any)) != 1 {
		t.Fatalf("list: %v", list)
	}
	id := saved["id"].(string)
	if st, _, _ := e.call(http.MethodDelete, "/v1/me/calculations/"+id, "silver", nil); st != 404 {
		t.Fatalf("someone else's calculation: %d", st)
	}
	if st, _, _ := e.call(http.MethodDelete, "/v1/me/calculations/"+id, "gold", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.entitlement_usage WHERE feature = 'calculator.use'`); n != 1 {
		t.Fatalf("usage = %d", n)
	}
}

func TestPriceAlerts(t *testing.T) {
	e := setup(t)
	e.seedPrices() // copper-red-free: 646,400 Toman/kg, +1 % on the day
	if st, body, _ := e.call(http.MethodPost, "/v1/me/alerts", "silver", map[string]any{"series": "copper-red-free", "kind": "above", "threshold": "6000000"}); st != 403 || body["code"] != "FEATURE_LOCKED" {
		t.Fatalf("silver: %d %v", st, body)
	}
	e.grantGold()
	create := func(body map[string]any) map[string]any {
		t.Helper()
		st, a, raw := e.call(http.MethodPost, "/v1/me/alerts", "gold", body)
		if st != 201 {
			t.Fatalf("create %v: %d %s", body, st, raw)
		}
		return a
	}
	above := create(map[string]any{"series": "copper-red-free", "kind": "above", "threshold": "6400000"})
	create(map[string]any{"series": "copper-red-free", "kind": "below", "threshold": "6000000"})
	create(map[string]any{"series": "copper-red-free", "kind": "move", "moveBp": 50})
	for name, bad := range map[string]map[string]any{
		"move too small": {"series": "copper-red-free", "kind": "move", "moveBp": 10},
		"no threshold":   {"series": "copper-red-free", "kind": "above"},
		"unknown series": {"series": "nope", "kind": "above", "threshold": "1"},
		"text threshold": {"series": "copper-red-free", "kind": "above", "threshold": "۱۲"},
	} {
		if st, _, _ := e.call(http.MethodPost, "/v1/me/alerts", "gold", bad); st != 400 {
			t.Fatalf("%s: %d", name, st)
		}
	}
	if above["product"] == "" || above["currency"] != "IRR" {
		t.Fatalf("alert view: %v", above)
	}

	sms := &fakeSMS{}
	svc := alerts.NewService(e.pool, sms, "https://alanfelez.ir", slog.New(slog.NewTextHandler(io.Discard, nil)))
	// above (646,400 ≥ 640,000) and move (+1 % ≥ 0.5 %) fire; below doesn't.
	if n, err := svc.Check(t.Context()); err != nil || n != 2 {
		t.Fatalf("first check: %d %v %v", n, err, sms.sent)
	}
	joined := strings.Join(sms.sent, "\n")
	if !strings.Contains(joined, "+989120000003") || !strings.Contains(joined, "۶۴۶٬۴۰۰ تومان/کیلوگرم") || !strings.Contains(joined, "/chart?series=copper-red-free") {
		t.Fatalf("sms text: %s", joined)
	}
	// Nothing new: no repeat.
	if n, _ := svc.Check(t.Context()); n != 0 {
		t.Fatalf("second check sent %d", n)
	}
	// The price falls under the band and comes back: above re-arms, then waits MinInterval before firing again.
	set := func(v int64) {
		if _, err := e.pool.Exec(t.Context(), `UPDATE market.price_latest SET price_minor = $1 WHERE series_id = (SELECT id FROM market.price_series WHERE slug = 'copper-red-free')`, v); err != nil {
			t.Fatal(err)
		}
	}
	set(6_300_000)
	if n, _ := svc.Check(t.Context()); n != 0 {
		t.Fatalf("re-arm check sent %d", n)
	}
	if n := e.count(`SELECT count(*) FROM app.price_alerts WHERE kind = 'above' AND armed`); n != 1 {
		t.Fatal("above must re-arm after dropping 0.5 % under the threshold")
	}
	set(6_500_000)
	if n, _ := svc.Check(t.Context()); n != 0 {
		t.Fatalf("within MinInterval sent %d", n)
	}
	if _, err := e.pool.Exec(t.Context(), `UPDATE app.price_alerts SET last_triggered_at = now() - interval '2 hours' WHERE kind = 'above'`); err != nil {
		t.Fatal(err)
	}
	if n, _ := svc.Check(t.Context()); n != 1 {
		t.Fatalf("after MinInterval sent %d", n)
	}

	// Paused alerts and lapsed plans send nothing; resuming needs Gold.
	id := above["id"].(string)
	if st, _, _ := e.call(http.MethodPut, "/v1/me/alerts/"+id, "gold", map[string]any{"active": false}); st != 204 {
		t.Fatalf("pause: %d", st)
	}
	if _, err := e.pool.Exec(t.Context(), `UPDATE app.subscriptions SET status = 'cancelled' WHERE user_id = '00000000-0000-0000-0000-000000000003'`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.pool.Exec(t.Context(), `UPDATE app.price_alerts SET armed = true, last_triggered_at = NULL`); err != nil {
		t.Fatal(err)
	}
	set(5_000_000) // would fire "below"
	if n, _ := svc.Check(t.Context()); n != 0 {
		t.Fatalf("lapsed plan sent %d", n)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/me/alerts/"+id, "gold", map[string]any{"active": true}); st != 403 {
		t.Fatalf("resume without Gold: %d", st)
	}
	_, list, _ := e.call(http.MethodGet, "/v1/me/alerts", "gold", nil)
	if len(list["items"].([]any)) != 3 || list["max"].(float64) != alerts.MaxPerUser {
		t.Fatalf("list: %v", list)
	}
	if st, _, _ := e.call(http.MethodDelete, "/v1/me/alerts/"+id, "gold", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.notifications WHERE template LIKE 'price_alert_%' AND status = 'sent'`); n != 3 {
		t.Fatalf("notifications = %d", n)
	}
}
