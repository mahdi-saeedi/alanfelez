//go:build integration

package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// The sales report and the dashboard's 30-day trend (client, 2026-11-05).
func TestRevenueReport(t *testing.T) {
	e := setup(t)
	e.call(http.MethodGet, "/v1/me", "gold", nil)
	e.enablePayments(true)
	in := map[string]any{"plan": "gold", "period": "month", "smsMetals": []string{"copper"}}
	st, body, raw := e.callH(http.MethodPost, "/v1/checkout", "gold", in, map[string]string{"Idempotency-Key": "revenue-1"})
	if st != 201 {
		t.Fatalf("checkout: %d %s", st, raw)
	}
	u := body["redirectUrl"].(string)
	if st, status := e.pay(body["order"].(map[string]any)["id"].(string), u[strings.LastIndex(u, "/")+1:], true); st != 200 || status != "paid" {
		t.Fatalf("pay: %d %s", st, status)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/revenue", "user", nil); st != 403 {
		t.Fatalf("a customer: %d", st)
	}
	st, r, raw := e.call(http.MethodGet, "/v1/admin/revenue", "support", nil)
	amount := func(k string) string { return r[k].(map[string]any)["amount"].(string) }
	if st != 200 || amount("gold") != "20000000" || amount("sms") != "1000000" || amount("total") != "21000000" || r["payingGold"] != float64(1) || amount("mrr") != "21000000" || r["orders"] != float64(1) {
		t.Fatalf("revenue: %d %s", st, raw)
	}
	_, d, raw := e.call(http.MethodGet, "/v1/admin/dashboard", "support", nil)
	trend := d["trend"].([]any)
	last := trend[len(trend)-1].(map[string]any)
	if len(trend) != 30 || last["revenue"].(map[string]any)["amount"] != "21000000" {
		t.Fatalf("trend: %s", raw)
	}
}
