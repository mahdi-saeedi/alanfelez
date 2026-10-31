//go:build integration

package api_test

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/alerts"
)

func auction(title, status string) map[string]any {
	return map[string]any{
		"titleFa": title, "metal": "copper", "category": "scrap", "quantity": 50, "unit": "ton", "status": status,
		"deadlineAt": time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339), "locationFa": "اصفهان، شهرک صنعتی",
		"organizerFa": "شرکت نمونه", "detailsFa": "بازدید از ساعت ۸ تا ۱۴.\nضمانتنامه لازم است.",
	}
}

// rawCall sends a non-JSON body (the PDF upload) and returns the status, the body and its headers.
func (e *env) rawCall(method, path, token, contentType string, body []byte) (int, []byte, http.Header) {
	e.t.Helper()
	req, _ := http.NewRequestWithContext(e.t.Context(), method, e.srv.URL+path, bytes.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	raw, _ := io.ReadAll(res.Body)
	return res.StatusCode, raw, res.Header
}

func TestMetalAuctions(t *testing.T) {
	e := setup(t)
	create := func(in map[string]any) string {
		t.Helper()
		st, body, raw := e.call(http.MethodPost, "/v1/admin/auctions", "editor", in)
		if st != 201 {
			t.Fatalf("create: %d %s", st, raw)
		}
		return body["id"].(string)
	}
	// Staff rules: support and users can't write; bad input is a 400.
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/auctions", "support", auction("مزایده", "open")); st != 403 {
		t.Fatalf("support must not add auctions: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/auctions", "user", auction("مزایده", "open")); st != 403 {
		t.Fatalf("a customer must not add auctions: %d", st)
	}
	for name, mut := range map[string]func(map[string]any){
		"unknown metal": func(m map[string]any) { m["metal"] = "gold-bar" },
		"bad category":  func(m map[string]any) { m["category"] = "global" },
		"zero quantity": func(m map[string]any) { m["quantity"] = 0 },
		"short title":   func(m map[string]any) { m["titleFa"] = "م" },
	} {
		in := auction("مزایده فروش ضایعات مس", "open")
		mut(in)
		if st, _, raw := e.call(http.MethodPost, "/v1/admin/auctions", "editor", in); st != 400 {
			t.Fatalf("%s: %d %s", name, st, raw)
		}
	}
	older := create(auction("مزایده فروش کاتد مس", "closed"))
	id := create(auction("مزایده فروش ۵۰ تن ضایعات مس", "open"))

	// The PDF notice: only a real PDF, at most 10 MB, only editor/admin.
	pdf := append([]byte("%PDF-1.7\n"), bytes.Repeat([]byte("x"), 1000)...)
	if st, _, _ := e.rawCall(http.MethodPut, "/v1/admin/auctions/"+id+"/pdf?fileName=x.pdf", "support", "application/pdf", pdf); st != 403 {
		t.Fatalf("support must not upload: %d", st)
	}
	if st, raw, _ := e.rawCall(http.MethodPut, "/v1/admin/auctions/"+id+"/pdf?fileName=x.pdf", "editor", "application/pdf", []byte("<html>")); st != 400 {
		t.Fatalf("not a PDF: %d %s", st, raw)
	}
	big := append([]byte("%PDF-"), make([]byte, 10<<20)...)
	if st, _, _ := e.rawCall(http.MethodPut, "/v1/admin/auctions/"+id+"/pdf?fileName=x.pdf", "editor", "application/pdf", big); st != 400 {
		t.Fatalf("over 10 MB: %d", st)
	}
	if st, raw, _ := e.rawCall(http.MethodPut, "/v1/admin/auctions/"+id+"/pdf?fileName="+url.QueryEscape("آگهی مزایده.pdf"), "editor", "application/pdf", pdf); st != 204 {
		t.Fatalf("upload: %d %s", st, raw)
	}
	nine := append([]byte("%PDF-"), make([]byte, 9<<20)...) // a large but allowed notice goes through the body limit
	if st, raw, _ := e.rawCall(http.MethodPut, "/v1/admin/auctions/"+older+"/pdf?fileName=big.pdf", "editor", "application/pdf", nine); st != 204 {
		t.Fatalf("9 MB upload: %d %s", st, raw)
	}

	// Everyone: title, metal, category, quantity, status; never the Gold fields.
	for _, tok := range []string{"", "user", "silver"} {
		st, body, raw := e.call(http.MethodGet, "/v1/auctions", tok, nil)
		if st != 200 || body["locked"] != true || body["requiredPlan"] != "gold" || body["total"].(float64) != 2 {
			t.Fatalf("%q: %d %s", tok, st, raw)
		}
		for _, leak := range []string{"اصفهان", "شرکت نمونه", "ضمانت", "deadlineAt", "hasPdf", "آگهی مزایده"} {
			if strings.Contains(raw, leak) {
				t.Fatalf("%q: locked field %q leaked: %s", tok, leak, raw)
			}
		}
		first := body["items"].([]any)[0].(map[string]any)
		if first["title"] != "مزایده فروش ۵۰ تن ضایعات مس" || first["quantity"].(float64) != 50 || first["unit"] != "ton" ||
			first["status"] != "open" || first["category"] != "scrap" || first["metal"].(map[string]any)["slug"] != "copper" {
			t.Fatalf("%q: teaser = %v", tok, first)
		}
		if st, _, _ := e.rawCall(http.MethodGet, "/v1/auctions/"+id+"/pdf", tok, "", nil); (tok == "" && st != 401) || (tok != "" && st != 403) {
			t.Fatalf("%q: pdf without Gold: %d", tok, st)
		}
	}

	// Gold: everything, filters, and the PDF.
	e.grantGold()
	st, body, raw := e.call(http.MethodGet, "/v1/auctions?status=open&category=scrap&metal=copper", "gold", nil)
	items := body["items"].([]any)
	if st != 200 || body["locked"] != false || len(items) != 1 || body["total"].(float64) != 1 {
		t.Fatalf("gold: %d %s", st, raw)
	}
	a := items[0].(map[string]any)
	if a["location"] != "اصفهان، شهرک صنعتی" || a["organizer"] != "شرکت نمونه" || a["hasPdf"] != true || a["deadlineAt"] == nil ||
		!strings.Contains(a["details"].(string), "\n") {
		t.Fatalf("gold fields: %v", a)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/auctions?status=paused", "gold", nil); len(body["items"].([]any)) != 0 {
		t.Fatalf("status filter: %v", body)
	}
	st, got, h := e.rawCall(http.MethodGet, "/v1/auctions/"+id+"/pdf", "gold", "", nil)
	if st != 200 || !bytes.Equal(got, pdf) || h.Get("Content-Type") != "application/pdf" || !strings.Contains(h.Get("Content-Disposition"), "filename*=utf-8''") {
		t.Fatalf("gold pdf: %d %v", st, h)
	}
	if st, _, _ := e.rawCall(http.MethodGet, "/v1/auctions/00000000-0000-0000-0000-000000000099/pdf", "gold", "", nil); st != 404 {
		t.Fatalf("missing pdf: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.entitlement_usage WHERE feature = 'auctions.read'`); n != 1 {
		t.Fatalf("usage = %d", n)
	}

	// Edit (status), the admin list, removing the PDF, deleting.
	upd := auction("مزایده فروش ۵۰ تن ضایعات مس", "paused")
	if st, _, raw := e.call(http.MethodPut, "/v1/admin/auctions/"+id, "editor", upd); st != 204 {
		t.Fatalf("update: %d %s", st, raw)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/auctions/00000000-0000-0000-0000-000000000099", "editor", upd); st != 404 {
		t.Fatalf("update missing: %d", st)
	}
	st, body, raw = e.call(http.MethodGet, "/v1/admin/auctions", "support", nil)
	if st != 200 || body["total"].(float64) != 2 {
		t.Fatalf("admin list: %d %s", st, raw)
	}
	adm := body["items"].([]any)[0].(map[string]any)
	if adm["status"] != "paused" || adm["pdfName"] != "آگهی مزایده.pdf" || adm["pdfSize"].(float64) != float64(len(pdf)) || adm["organizerFa"] != "شرکت نمونه" {
		t.Fatalf("admin row: %v", adm)
	}
	if st, got, _ := e.rawCall(http.MethodGet, "/v1/admin/auctions/"+id+"/pdf", "support", "", nil); st != 200 || !bytes.Equal(got, pdf) {
		t.Fatalf("staff pdf: %d", st)
	}
	if st, _, _ := e.rawCall(http.MethodDelete, "/v1/admin/auctions/"+id+"/pdf", "editor", "", nil); st != 204 {
		t.Fatalf("remove pdf: %d", st)
	}
	if st, _, _ := e.rawCall(http.MethodGet, "/v1/auctions/"+id+"/pdf", "gold", "", nil); st != 404 {
		t.Fatalf("removed pdf: %d", st)
	}
	if st, _, _ := e.call(http.MethodDelete, "/v1/admin/auctions/"+older, "editor", nil); st != 204 {
		t.Fatalf("delete: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM market.auction_files`); n != 0 {
		t.Fatalf("files left after delete = %d", n)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action LIKE 'auction.%'`); n != 7 {
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
	// Moisture comes off first, then impurity (on the dry weight), then recovery: 1 t, 5 % water, 10 % dirt, 60 %
	// copper → 513 kg payable × 700,000 Toman = 359,100,000 Toman.
	wet := map[string]any{"unitPriceRialPerKg": 7_000_000, "weightGrams": 1_000_000, "moistureBp": 500, "impurityBp": 1000, "recoveryBp": 6000, "deductionBp": 0, "shippingRial": 0, "shippingPaidBy": "seller"}
	if _, res, raw := e.call(http.MethodPost, "/v1/calculator/estimate", "gold", wet); res["dryWeightGrams"].(float64) != 950_000 ||
		res["cleanWeightGrams"].(float64) != 855_000 || res["netWeightGrams"].(float64) != 513_000 || res["valueRial"].(float64) != 3_591_000_000 {
		t.Fatalf("moisture and recovery: %s", raw)
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
	// Kept for 3 months: an older one is deleted when the list is read.
	if _, err := e.pool.Exec(t.Context(), `INSERT INTO app.calculations (user_id, name, input, result, created_at)
		VALUES ('00000000-0000-0000-0000-000000000003', 'old', '{}', '{}', now() - interval '4 months')`); err != nil {
		t.Fatal(err)
	}
	_, list, _ := e.call(http.MethodGet, "/v1/me/calculations", "gold", nil)
	if len(list["items"].([]any)) != 1 || e.count(`SELECT count(*) FROM app.calculations WHERE name = 'old'`) != 0 {
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
