//go:build integration

package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// User activity (admin «رفتار کاربران») and the dashboard (client 2026-11-03).
func TestUserActivity(t *testing.T) {
	e := setup(t)
	e.seedPrices()
	const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
	send := func(token string, body map[string]any) {
		t.Helper()
		if st, _, raw := e.callH(http.MethodPost, "/v1/visits", token, body, map[string]string{"User-Agent": chrome}); st != 204 {
			t.Fatalf("visit %v: %d %s", body, st, raw)
		}
	}
	const v1, v2, v3 = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"
	// The user opens copper prices, a copper chart (by its price row) and the home page; one page is reported twice.
	send("user", map[string]any{"path": "/prices?metal=copper", "view": v1})
	send("user", map[string]any{"path": "/prices?metal=copper", "view": v1}) // a repeat of the same view
	send("user", map[string]any{"path": "/en/chart?series=copper-red-free", "view": v2})
	send("user", map[string]any{"path": "/", "view": v3})
	send("user", map[string]any{"path": "/prices?metal=copper", "view": v1, "seconds": 90})
	send("user", map[string]any{"path": "/prices?metal=copper", "view": v1, "seconds": 99999}) // capped at 30 minutes
	// Someone else can't add time to the user's view; anonymous visitors only count per metal.
	send("gold", map[string]any{"path": "/prices?metal=copper", "view": v1, "seconds": 500})
	send("", map[string]any{"path": "/prices/zinc", "view": "44444444-4444-4444-8444-444444444444"})
	send("", map[string]any{"path": "/prices?metal=no-such-metal"})

	if n := e.count(`SELECT count(*) FROM app.page_views`); n != 3 {
		t.Fatalf("page views = %d, want 3 (signed-in only, repeats ignored)", n)
	}
	if n := e.count(`SELECT seconds FROM app.page_views WHERE id = '` + v1 + `'`); n != 90+1800 {
		t.Fatalf("seconds = %d", n)
	}
	if n := e.count(`SELECT count(*) FROM app.page_views WHERE id = '` + v2 + `' AND metal = 'copper' AND series_slug = 'copper-red-free' AND section = 'chart'`); n != 1 {
		t.Fatal("the chart page wasn't tied to copper")
	}
	if n := e.count(`SELECT views FROM app.metal_views_daily WHERE metal = 'zinc'`); n != 1 {
		t.Fatalf("anonymous zinc views = %d", n)
	}
	if n := e.count(`SELECT count(*) FROM app.metal_views_daily WHERE metal = 'no-such-metal'`); n != 0 {
		t.Fatal("an unknown metal was counted")
	}

	// Staff only; every staff role may read it.
	for tok, want := range map[string]int{"": 401, "user": 403, "gold": 403, "support": 200, "editor": 200} {
		if st, _, _ := e.call(http.MethodGet, "/v1/admin/activity", tok, nil); st != want {
			t.Fatalf("activity as %q: %d, want %d", tok, st, want)
		}
	}
	st, body, raw := e.call(http.MethodGet, "/v1/admin/activity?metal=copper", "support", nil)
	if st != 200 || body["total"].(float64) != 1 {
		t.Fatalf("activity: %d %s", st, raw)
	}
	row := body["items"].([]any)[0].(map[string]any)
	metals := row["metals"].([]any)
	if row["phone"] != nil && row["username"] != "09120000001" || row["views"].(float64) != 3 || row["seconds"].(float64) != 1890 ||
		len(metals) != 1 || metals[0].(map[string]any)["metal"] != "copper" || metals[0].(map[string]any)["views"].(float64) != 2 {
		t.Fatalf("row: %s", raw)
	}
	if row["sections"].([]any)[0].(map[string]any)["section"] != "prices" {
		t.Fatalf("top section: %s", raw)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/admin/activity?metal=zinc", "support", nil); body["total"].(float64) != 0 {
		t.Fatal("zinc filter matched the user")
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/activity?from=2026-02-01&to=2026-01-01", "support", nil); st != 400 {
		t.Fatalf("from after to: %d", st)
	}
	// An old range has nothing.
	if _, body, _ := e.call(http.MethodGet, "/v1/admin/activity?from=2025-01-01&to=2025-01-31", "support", nil); body["total"].(float64) != 0 {
		t.Fatal("activity outside the range")
	}

	// One user's profile.
	st, body, raw = e.call(http.MethodGet, "/v1/admin/activity/00000000-0000-0000-0000-000000000001", "support", nil)
	if st != 200 || body["views"].(float64) != 3 || len(body["pages"].([]any)) != 3 || len(body["daily"].([]any)) != 1 {
		t.Fatalf("profile: %d %s", st, raw)
	}
	if p := body["products"].([]any); len(p) != 1 || p[0].(map[string]any)["series"] != "copper-red-free" {
		t.Fatalf("products: %s", raw)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/activity/00000000-0000-0000-0000-0000000000ff", "support", nil); st != 404 {
		t.Fatalf("unknown user: %d", st)
	}

	// Exports: CSV with a byte order mark, audited.
	for _, path := range []string{"/v1/admin/activity/export", "/v1/admin/activity/export?userId=00000000-0000-0000-0000-000000000001", "/v1/admin/users/export?metal=copper"} {
		st, _, raw := e.call(http.MethodGet, path, "support", nil)
		if st != 200 || !strings.HasPrefix(raw, "\xef\xbb\xbf") || !strings.Contains(raw, "09120000001") && !strings.Contains(raw, "/prices") {
			t.Fatalf("%s: %d %q", path, st, raw)
		}
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action IN ('activity.export', 'users.export')`); n != 3 {
		t.Fatalf("export audits = %d", n)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/users/export", "user", nil); st != 403 {
		t.Fatalf("users export as a customer: %d", st)
	}

	// Dashboard: today's numbers and an old day.
	st, body, raw = e.call(http.MethodGet, "/v1/admin/dashboard", "support", nil)
	if st != 200 || body["today"] != true || body["signedIn"].(float64) != 1 || body["visitors"].(float64) != 2 || len(body["metals"].([]any)) != 2 {
		t.Fatalf("dashboard: %d %s", st, raw)
	}
	if _, body, raw = e.call(http.MethodGet, "/v1/admin/dashboard?day=2026-01-01", "support", nil); body["today"] != false || body["visitors"].(float64) != 0 {
		t.Fatalf("old day: %s", raw)
	}

	// Users list filters and paging.
	_, body, raw = e.call(http.MethodGet, "/v1/admin/users?metal=zinc&activity=trader", "support", nil)
	if body["total"].(float64) != 1 || len(body["items"].([]any)) != 1 || len(body["provinces"].([]any)) != 1 {
		t.Fatalf("users filter: %s", raw)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/admin/users?plan=gold", "support", nil); body["total"].(float64) != 0 {
		t.Fatal("plan filter")
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/admin/users?q=%D8%A8%D8%A7%D8%B2%D8%B1%DA%AF%D8%A7%D9%86%DB%8C%20%D9%86%D9%85%D9%88%D9%86%D9%87", "support", nil); body["total"].(float64) != 1 {
		t.Fatal("search by a company name with a space")
	}
}
