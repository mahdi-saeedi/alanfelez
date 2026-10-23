//go:build integration

package api_test

import (
	"net/http"
	"testing"
	"time"
)

// copperRedPublic returns the public price item of copper-red-free (nil when it isn't listed).
func (e *env) copperRedPublic() map[string]any {
	e.t.Helper()
	st, body, _ := e.call(http.MethodGet, "/v1/prices", "", nil)
	if st != 200 {
		e.t.Fatalf("GET /v1/prices: %d", st)
	}
	for _, it := range body["items"].([]any) {
		m := it.(map[string]any)
		if m["series"].(map[string]any)["slug"] == "copper-red-free" {
			return m
		}
	}
	return nil
}

func (e *env) auditCount(action string) int {
	e.t.Helper()
	var n int
	if err := e.pool.QueryRow(e.t.Context(), `SELECT count(*) FROM app.audit_log WHERE action = $1`, action).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func TestPriceHistoryAndVoid(t *testing.T) {
	e := setup(t)
	at := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	ids := make([]string, 0, 2)
	for i, amount := range []string{"6400000", "6600000"} {
		st, body, _ := e.call(http.MethodPost, "/v1/admin/prices", "editor",
			map[string]any{"series": "copper-red-free", "amount": amount, "observedAt": at.Add(time.Duration(i) * time.Hour)})
		if st != 201 {
			t.Fatalf("entry %s: %d %v", amount, st, body)
		}
		ids = append(ids, body["id"].(string))
	}

	// History: newest first, with who entered it and the price before it.
	st, body, _ := e.call(http.MethodGet, "/v1/admin/series/copper-red-free/points", "support", nil)
	if st != 200 {
		t.Fatalf("history: %d %v", st, body)
	}
	items := body["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("history items = %d, want 2", len(items))
	}
	top := items[0].(map[string]any)
	if top["amount"] != "6600000" || top["enteredByName"] != "editor" || top["previousAmount"] != "6400000" || top["isManual"] != true {
		t.Fatalf("history top: %v", top)
	}

	cases := []struct {
		method, path, token string
		want                int
	}{
		{http.MethodGet, "/v1/admin/series/copper-red-free/points", "", 401},
		{http.MethodGet, "/v1/admin/series/copper-red-free/points", "user", 403},
		{http.MethodGet, "/v1/admin/series/nope/points", "support", 404},
		{http.MethodPost, "/v1/admin/prices/" + ids[1] + "/void", "", 401},
		{http.MethodPost, "/v1/admin/prices/" + ids[1] + "/void", "support", 403},
		{http.MethodPost, "/v1/admin/prices/999999999/void", "editor", 404},
	}
	for _, c := range cases {
		if st, b, _ := e.call(c.method, c.path, c.token, map[string]any{}); st != c.want {
			t.Errorf("%s %s as %q: %d, want %d (%v)", c.method, c.path, c.token, st, c.want, b)
		}
	}

	// Voiding the latest price brings the previous one back as the latest.
	st, body, _ = e.call(http.MethodPost, "/v1/admin/prices/"+ids[1]+"/void", "editor", map[string]any{"reason": "typo"})
	if st != 200 || body["status"] != "rejected" {
		t.Fatalf("void: %d %v", st, body)
	}
	if m := e.copperRedPublic(); m == nil || m["price"].(map[string]any)["amount"] != "6400000" {
		t.Fatalf("latest after void: %v", m)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/prices/"+ids[1]+"/void", "editor", nil); st != 409 {
		t.Fatalf("void twice: %d, want 409", st)
	}
	_, body, _ = e.call(http.MethodGet, "/v1/admin/series/copper-red-free/points", "support", nil)
	if top := body["items"].([]any)[0].(map[string]any); top["status"] != "rejected" || top["reviewedByName"] != "editor" {
		t.Fatalf("history after void: %v", top)
	}

	// Voiding the only published point left: the series has no latest price any more (kept in history).
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/prices/"+ids[0]+"/void", "editor", nil); st != 200 {
		t.Fatalf("void first: %d", st)
	}
	if m := e.copperRedPublic(); m != nil && m["price"] != nil {
		t.Fatalf("latest after voiding everything: %v", m)
	}
	if n := e.count(`SELECT count(*) FROM market.price_points WHERE series_id = (SELECT id FROM market.price_series WHERE slug = 'copper-red-free')`); n != 2 {
		t.Fatalf("points kept = %d, want 2 (voiding never deletes)", n)
	}
	if n := e.auditCount("price.void"); n != 2 {
		t.Fatalf("price.void audit rows = %d, want 2", n)
	}
}

func TestCatalogAdmin(t *testing.T) {
	e := setup(t)
	if st, body, _ := e.call(http.MethodGet, "/v1/admin/catalog", "support", nil); st != 200 || len(body["metals"].([]any)) == 0 {
		t.Fatalf("catalog: %d %v", st, body)
	}
	metal := map[string]any{"slug": "nickel", "nameFa": "نیکل", "nameEn": "Nickel"}
	product := map[string]any{"slug": "nickel-cathode", "metal": "nickel", "category": "raw", "nameFa": "کاتد نیکل"}
	series := map[string]any{"slug": "nickel-cathode-lme", "product": "nickel-cathode", "market": "lme", "currency": "USD", "unit": "ton"}
	steps := []struct {
		method, path, token string
		body                any
		want                int
	}{
		{http.MethodGet, "/v1/admin/catalog", "", nil, 401},
		{http.MethodGet, "/v1/admin/catalog", "user", nil, 403},
		{http.MethodPost, "/v1/admin/metals", "support", metal, 403},
		{http.MethodPost, "/v1/admin/metals", "", metal, 401},
		{http.MethodPost, "/v1/admin/metals", "editor", metal, 201},
		{http.MethodPost, "/v1/admin/metals", "editor", metal, 409},
		{http.MethodPost, "/v1/admin/products", "editor", map[string]any{"slug": "x-1", "metal": "nope", "category": "raw", "nameFa": "x"}, 404},
		{http.MethodPost, "/v1/admin/products", "support", product, 403},
		{http.MethodPost, "/v1/admin/products", "editor", product, 201},
		{http.MethodPost, "/v1/admin/products", "editor", product, 409},
		{http.MethodPost, "/v1/admin/series", "editor", map[string]any{"slug": "x-2", "product": "nickel-cathode", "market": "nope", "currency": "USD", "unit": "ton"}, 404},
		{http.MethodPost, "/v1/admin/series", "support", series, 403},
		{http.MethodPost, "/v1/admin/series", "editor", series, 201},
		// same product × market × currency × unit under another slug
		{http.MethodPost, "/v1/admin/series", "editor", map[string]any{"slug": "nickel-2", "product": "nickel-cathode", "market": "lme", "currency": "USD", "unit": "ton"}, 409},
		{http.MethodPost, "/v1/admin/prices", "editor", map[string]any{"series": "nickel-cathode-lme", "amount": "1650000"}, 201},
		{http.MethodPost, "/v1/admin/catalog/active", "support", map[string]any{"kind": "product", "slug": "copper-red", "active": false}, 403},
		{http.MethodPost, "/v1/admin/catalog/active", "editor", map[string]any{"kind": "series", "slug": "nope", "active": false}, 404},
	}
	for _, c := range steps {
		if st, b, _ := e.call(c.method, c.path, c.token, c.body); st != c.want {
			t.Errorf("%s %s as %q: %d, want %d (%v)", c.method, c.path, c.token, st, c.want, b)
		}
	}
	_, body, _ := e.call(http.MethodGet, "/v1/admin/series", "support", nil)
	for _, it := range body["items"].([]any) {
		if m := it.(map[string]any); m["slug"] == "nickel-cathode-lme" && m["isBase"] != false {
			t.Fatalf("a new series must never be a base series: %v", m)
		}
	}

	// Deactivating a product hides its series from the site; reactivating brings them back. Nothing is deleted.
	e.call(http.MethodPost, "/v1/admin/prices", "editor", map[string]any{"series": "copper-red-free", "amount": "6400000"})
	if e.copperRedPublic() == nil {
		t.Fatal("copper-red-free should be listed")
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/catalog/active", "editor", map[string]any{"kind": "product", "slug": "copper-red", "active": false}); st != 204 {
		t.Fatalf("deactivate: %d", st)
	}
	if e.copperRedPublic() != nil {
		t.Fatal("an inactive product's series must not be listed")
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/catalog/active", "editor", map[string]any{"kind": "product", "slug": "copper-red", "active": true}); st != 204 {
		t.Fatalf("reactivate: %d", st)
	}
	if e.copperRedPublic() == nil {
		t.Fatal("copper-red-free should be listed again")
	}
	for action, want := range map[string]int{"metal.create": 1, "product.create": 1, "series.create": 1, "product.deactivate": 1, "product.activate": 1} {
		if n := e.auditCount(action); n != want {
			t.Errorf("%s audit rows = %d, want %d", action, n, want)
		}
	}
}

func TestBackDatedEntry(t *testing.T) {
	e := setup(t)
	e.grantGold()
	now := time.Now().UTC().Truncate(time.Second)
	old := now.AddDate(0, 0, -20)
	post := func(amount string, at time.Time) (int, map[string]any) {
		st, body, _ := e.call(http.MethodPost, "/v1/admin/prices", "editor", map[string]any{"series": "copper-red-free", "amount": amount, "observedAt": at})
		return st, body
	}
	// 20 days ago the price was 5,000,000; today it is 6,400,000 (+28 %, entered with force).
	if st, b := post("5000000", old); st != 201 {
		t.Fatalf("old: %d %v", st, b)
	}
	if st, b, _ := e.call(http.MethodPost, "/v1/admin/prices", "editor", map[string]any{"series": "copper-red-free", "amount": "6400000", "observedAt": now.Add(-time.Minute), "force": true}); st != 201 {
		t.Fatalf("today: %d %v", st, b)
	}
	// A price 10 days ago close to that time's price passes the gate, though it is far from today's price.
	st, b := post("5100000", now.AddDate(0, 0, -10))
	if st != 201 || b["previousAmount"] != "5000000" || b["jumpBp"].(float64) != 200 {
		t.Fatalf("back-dated near its time: %d %v", st, b)
	}
	// It goes into the history (and the chart) but doesn't move today's price.
	if m := e.copperRedPublic(); m["price"].(map[string]any)["amount"] != "6400000" {
		t.Fatalf("latest moved by a back-dated entry: %v", m)
	}
	_, chart, _ := e.call(http.MethodGet, "/v1/series/copper-red-free/points?range=1M", "gold", nil)
	if n := len(chart["points"].([]any)); n != 3 {
		t.Fatalf("chart points = %d, want 3 (the back-dated one included)", n)
	}
	// A typo in history (10× the price of its time) is still caught.
	if st, b := post("51000000", now.AddDate(0, 0, -5)); st != 422 || b["code"] != "PRICE_JUMP" {
		t.Fatalf("back-dated typo: %d %v", st, b)
	}
	// Before the first point there is nothing earlier: compared with the first point after it.
	if st, b := post("4900000", now.AddDate(0, 0, -25)); st != 201 || b["previousAmount"] != "5000000" {
		t.Fatalf("before the first point: %d %v", st, b)
	}

	// The prices on a date: the last published point at or before it, per series.
	at := now.AddDate(0, 0, -9).Format(time.RFC3339)
	st, body, _ := e.call(http.MethodGet, "/v1/admin/prices/at?at="+at, "support", nil)
	if st != 200 {
		t.Fatalf("prices at: %d %v", st, body)
	}
	found := false
	for _, it := range body["items"].([]any) {
		if m := it.(map[string]any); m["series"] == "copper-red-free" {
			found = m["amount"] == "5100000"
		}
	}
	if !found {
		t.Fatalf("prices at %s: %v", at, body)
	}
	for _, c := range []struct {
		token string
		want  int
	}{{"", 401}, {"user", 403}} {
		if st, _, _ := e.call(http.MethodGet, "/v1/admin/prices/at?at="+at, c.token, nil); st != c.want {
			t.Errorf("prices at as %q: %d, want %d", c.token, st, c.want)
		}
	}
}
