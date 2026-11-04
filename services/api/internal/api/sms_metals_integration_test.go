//go:build integration

package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// Paid SMS metals (client, 2026-11-04): 100,000 Toman per metal per month of the plan, chosen at checkout; paid
// metals can't be changed or refunded; more can be added during the plan at the full price of its length.
func TestPaidSmsMetals(t *testing.T) {
	e := setup(t)
	e.call(http.MethodGet, "/v1/me", "gold", nil)
	e.enablePayments(false)
	if st, _, _ := e.callH(http.MethodPost, "/v1/checkout/sms-metals", "gold", map[string]any{"metals": []string{"lead"}}, map[string]string{"Idempotency-Key": "sms-off-1"}); st != 409 {
		t.Fatalf("payments off: %d", st)
	}
	e.enablePayments(true)

	// Quote: Gold 2,000,000 Toman a month + 3 metals × 100,000 = 2,300,000; 3 months: 300,000 per metal.
	in := map[string]any{"plan": "gold", "period": "month", "smsMetals": []string{"copper", "zinc", "lead", "copper"}}
	st, q, raw := e.call(http.MethodPost, "/v1/checkout/quote", "gold", in)
	if st != 200 || q["amount"].(map[string]any)["amount"] != "23000000" || q["smsPrice"].(map[string]any)["amount"] != "3000000" || len(q["smsMetals"].([]any)) != 3 {
		t.Fatalf("quote: %d %s", st, raw)
	}
	in["period"] = "quarter"
	if _, q, raw := e.call(http.MethodPost, "/v1/checkout/quote", "gold", in); q["smsMetalPrice"].(map[string]any)["amount"] != "3000000" || q["smsPrice"].(map[string]any)["amount"] != "9000000" {
		t.Fatalf("quarter quote: %s", raw)
	}
	for _, bad := range []map[string]any{
		{"plan": "silver", "period": "month", "smsMetals": []string{"copper"}}, // Gold only
		{"plan": "gold", "period": "month", "smsMetals": []string{"gold-bar"}}, // unknown metal
	} {
		if st, _, _ := e.call(http.MethodPost, "/v1/checkout/quote", "gold", bad); st != 400 {
			t.Fatalf("bad quote %v: %d", bad, st)
		}
	}

	// Checkout with copper and zinc, paid: the subscription sends SMS for both.
	in = map[string]any{"plan": "gold", "period": "month", "smsMetals": []string{"copper", "zinc"}}
	st, body, raw := e.callH(http.MethodPost, "/v1/checkout", "gold", in, map[string]string{"Idempotency-Key": "sms-metals-1"})
	if st != 201 || body["order"].(map[string]any)["amount"].(map[string]any)["amount"] != "22000000" {
		t.Fatalf("checkout: %d %s", st, raw)
	}
	id := body["order"].(map[string]any)["id"].(string)
	u := body["redirectUrl"].(string)
	if st, status := e.pay(id, u[strings.LastIndex(u, "/")+1:], true); st != 200 || status != "paid" {
		t.Fatalf("pay: %d %s", st, status)
	}
	if _, s, raw := e.call(http.MethodGet, "/v1/me/sms-settings", "gold", nil); len(s["metals"].([]any)) != 2 || s["chooseUntil"] != nil || s["addMetalPrice"].(map[string]any)["amount"] != "1000000" {
		t.Fatalf("settings after paying: %s", raw)
	}

	// Adding: copper is already paid, lead is new → 100,000 Toman (a one-month plan), whatever is left of it.
	add := map[string]any{"metals": []string{"copper", "lead"}}
	if _, aq, raw := e.call(http.MethodPost, "/v1/checkout/sms-metals/quote", "gold", add); len(aq["adding"].([]any)) != 1 || aq["amount"].(map[string]any)["amount"] != "1000000" || aq["months"] != float64(1) {
		t.Fatalf("add quote: %s", raw)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/checkout/sms-metals/quote", "user", add); st != 403 {
		t.Fatalf("add without Gold: %d", st)
	}
	if st, _, _ := e.callH(http.MethodPost, "/v1/checkout/sms-metals", "gold", map[string]any{"metals": []string{"copper"}}, map[string]string{"Idempotency-Key": "sms-add-0"}); st != 400 {
		t.Fatalf("nothing new to add: %d", st)
	}
	st, body, raw = e.callH(http.MethodPost, "/v1/checkout/sms-metals", "gold", add, map[string]string{"Idempotency-Key": "sms-add-1"})
	if st != 201 || body["order"].(map[string]any)["kind"] != "sms_addon" {
		t.Fatalf("add: %d %s", st, raw)
	}
	id = body["order"].(map[string]any)["id"].(string)
	u = body["redirectUrl"].(string)
	if st, status := e.pay(id, u[strings.LastIndex(u, "/")+1:], true); st != 200 || status != "paid" {
		t.Fatalf("pay add-on: %d %s", st, status)
	}
	if _, s, raw := e.call(http.MethodGet, "/v1/me/sms-settings", "gold", nil); len(s["metals"].([]any)) != 3 {
		t.Fatalf("settings after the add-on: %s", raw)
	}

	// Refunds: the add-on never; the plan's order only for the plan's part (not the metals).
	_, orders, _ := e.call(http.MethodGet, "/v1/me/orders", "gold", nil)
	for _, o := range orders["items"].([]any) {
		o := o.(map[string]any)
		if o["kind"] == "sms_addon" && o["refundable"] != false {
			t.Fatal("add-on refundable")
		}
	}
	if n := e.count(`SELECT count(*) FROM app.subscription_sms_metals`); n != 3 {
		t.Fatalf("paid metals: %d", n)
	}
}
