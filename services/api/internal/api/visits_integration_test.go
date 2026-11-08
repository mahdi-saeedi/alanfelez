//go:build integration

package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestVisitorStats(t *testing.T) {
	e := setup(t)
	const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
	const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"
	visit := func(token, ua string) {
		t.Helper()
		if st, _, raw := e.callH(http.MethodPost, "/v1/visits", token, map[string]any{"path": "/prices"}, map[string]string{"User-Agent": ua}); st != 204 {
			t.Fatalf("visit: %d %s", st, raw)
		}
	}
	visit("", chrome)
	visit("", chrome)  // same visitor, second page
	visit("", firefox) // another browser = another visitor
	visit("", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")
	visit("", "") // scripts aren't counted either
	// A signed-in visitor is known by name.
	visit("gold", chrome)
	visit("gold", chrome)
	visit("gold", chrome)

	if n := e.count(`SELECT count(*) FROM app.daily_visits WHERE visitor LIKE 'a:%' AND visitor ~ '^a:[0-9a-f]{32}$'`); n != 2 {
		t.Fatalf("anonymous ids = %d", n)
	}
	if n := e.count(`SELECT count(*) FROM app.daily_visits WHERE visitor LIKE '%127.0.0.1%' OR visitor LIKE '%Mozilla%'`); n != 0 {
		t.Fatal("the IP or user agent was stored")
	}

	for tok, want := range map[string]int{"": 401, "user": 403} {
		if st, _, _ := e.call(http.MethodGet, "/v1/admin/visits", tok, nil); st != want {
			t.Fatalf("%q: %d, want %d", tok, st, want)
		}
	}
	st, body, raw := e.call(http.MethodGet, "/v1/admin/visits", "support", nil)
	if st != 200 {
		t.Fatalf("admin visits: %d %s", st, raw)
	}
	days := body["days"].([]any)
	today := days[0].(map[string]any)
	if len(days) != 30 || today["visitors"].(float64) != 3 || today["signedIn"].(float64) != 1 || today["pageviews"].(float64) != 6 || today["day"] != body["day"] {
		t.Fatalf("totals: %s", raw)
	}
	users := body["users"].([]any)
	u := users[0].(map[string]any)
	if len(users) != 1 || u["name"] != "Gol Test" || u["phone"] != "09120000003" || u["pageviews"].(float64) != 3 || u["plan"] != "free" {
		t.Fatalf("users: %s", raw)
	}
	// Another day: no users, and the 30-day totals are still there.
	_, body, raw = e.call(http.MethodGet, "/v1/admin/visits?day=2026-01-01", "support", nil)
	if len(body["users"].([]any)) != 0 || len(body["days"].([]any)) != 30 || !strings.Contains(raw, `"day":"2026-01-01"`) {
		t.Fatalf("other day: %s", raw)
	}
	// A chosen range (client, 2026-11-08): each of its days, and everyone signed in who came in it, one row each.
	to := today["day"].(string)
	from := mustDay(t, to).AddDate(0, 0, -9).Format("2006-01-02")
	_, body, raw = e.call(http.MethodGet, "/v1/admin/visits?from="+from+"&to="+to, "support", nil)
	if len(body["days"].([]any)) != 10 || body["day"] != nil || len(body["users"].([]any)) != 1 || body["users"].([]any)[0].(map[string]any)["days"].(float64) != 1 {
		t.Fatalf("range: %s", raw)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/visits?from="+to+"&to="+from, "support", nil); st != 400 {
		t.Fatalf("from after to: %d", st)
	}
	// A range far in the past has no people (they're kept 90 days) and is capped at 366 days.
	_, body, raw = e.call(http.MethodGet, "/v1/admin/visits?from=2020-01-01&to=2026-01-01", "support", nil)
	if len(body["days"].([]any)) != 366 || len(body["users"].([]any)) != 0 {
		t.Fatalf("old range: %d days %s", len(body["days"].([]any)), raw[:200])
	}
}

// mustDay parses a "2006-01-02" day.
func mustDay(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}
