//go:build integration

package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// «تحلیل بازدید» (client, 2026-11-05): nameless totals from the website's page beacons and searches.
func TestSiteAnalytics(t *testing.T) {
	e := setup(t)
	e.seedPrices()
	const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"
	const pc = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36"
	visit := func(token, ua string, body map[string]any) {
		t.Helper()
		if st, _, raw := e.callH(http.MethodPost, "/v1/visits", token, body, map[string]string{"User-Agent": ua}); st != 204 {
			t.Fatalf("visit: %d %s", st, raw)
		}
	}
	// A guest lands from Instagram on a copper chart, then reads it 40 seconds, then opens the plans page from it.
	visit("", phone, map[string]any{"path": "/chart?series=copper-red-free", "landing": true, "ref": "https://l.instagram.com/?u=x"})
	visit("", phone, map[string]any{"path": "/chart?series=copper-red-free", "seconds": 40})
	visit("", phone, map[string]any{"path": "/plans", "from": "/chart?series=copper-red-free"})
	// Another guest from a campaign; a Gold member twice on the same product (one unique visitor).
	e.grantGold()
	visit("", pc, map[string]any{"path": "/prices/copper", "landing": true, "utm": "Insta Aban", "campaign": "aban-1404"})
	visit("gold", pc, map[string]any{"path": "/chart?series=copper-red-free"})
	visit("gold", pc, map[string]any{"path": "/chart?series=copper-red-free"})
	// Searches: one found something, one didn't.
	e.callH(http.MethodPost, "/v1/searches", "", map[string]any{"q": " قيمت مس ", "results": 3}, map[string]string{"User-Agent": pc})
	e.callH(http.MethodPost, "/v1/searches", "", map[string]any{"q": "نیکل", "results": 0}, map[string]string{"User-Agent": pc})

	if st, _, _ := e.call(http.MethodGet, "/v1/admin/analytics", "user", nil); st != 403 {
		t.Fatalf("a customer: %d", st)
	}
	st, a, raw := e.call(http.MethodGet, "/v1/admin/analytics", "support", nil)
	if st != 200 {
		t.Fatalf("analytics: %d %s", st, raw)
	}
	var product map[string]any
	for _, p := range a["products"].([]any) {
		if p.(map[string]any)["series"] == "copper-red-free" {
			product = p.(map[string]any)
		}
	}
	if product == nil || product["views"] != float64(3) || product["paidViews"] != float64(2) || product["visitors"] != float64(2) || product["seconds"] != float64(40) {
		t.Fatalf("product: %v", product)
	}
	funnel := a["funnel"].(map[string]any)
	if funnel["plansVisitors"] != float64(1) || funnel["visitors"] != float64(3) {
		t.Fatalf("funnel: %v", funnel)
	}
	from := a["plansFrom"].([]any)
	if len(from) != 1 || from[0].(map[string]any)["section"] != "chart" || from[0].(map[string]any)["metal"] != "copper" {
		t.Fatalf("plans from: %v", from)
	}
	traffic := map[string]float64{}
	for _, r := range a["traffic"].([]any) {
		r := r.(map[string]any)
		traffic[r["source"].(string)+"|"+r["campaign"].(string)] = r["landings"].(float64)
	}
	if traffic["instagram|"] != 1 || traffic["utm:insta-aban|aban-1404"] != 1 {
		t.Fatalf("traffic: %v", traffic)
	}
	devices := map[string]float64{}
	for _, r := range a["devices"].([]any) {
		devices[r.(map[string]any)["device"].(string)] = r.(map[string]any)["visitorDays"].(float64)
	}
	if devices["mobile"] != 1 || devices["desktop"] != 2 {
		t.Fatalf("devices: %v", devices)
	}
	searches := a["searches"].([]any)
	if len(searches) != 2 || !strings.Contains(raw2(searches), `"term":"قیمت مس"`) || !strings.Contains(raw2(searches), `"zeroResults":1`) {
		t.Fatalf("searches: %v", searches)
	}
	if st, raw, _ := e.rawCall(http.MethodGet, "/v1/admin/analytics/export?table=products", "support", "", nil); st != 200 || !strings.Contains(string(raw), "copper") && !strings.Contains(string(raw), "مس") {
		t.Fatalf("export: %d %s", st, raw)
	}
}

func raw2(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
