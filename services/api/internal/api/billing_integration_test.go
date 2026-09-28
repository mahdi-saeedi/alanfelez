//go:build integration

package api_test

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/alanfelez/alanfelez/services/api/internal/notify"
)

const customer = "user" // principal 09120000001 (see principals in api_integration_test.go)

func (e *env) enablePayments(on bool) {
	e.t.Helper()
	if _, err := e.pool.Exec(e.t.Context(),
		`INSERT INTO app.feature_flags (key, enabled) VALUES ('payments.enabled', $1)
		 ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled`, on); err != nil {
		e.t.Fatal(err)
	}
}

// checkout starts a one-month purchase and returns (status, order id, authority from the redirect URL).
func (e *env) checkout(token, plan, key string) (int, string, string, map[string]any) {
	e.t.Helper()
	st, body, _ := e.callH(http.MethodPost, "/v1/checkout", token, map[string]any{"plan": plan, "period": "month"},
		map[string]string{"Idempotency-Key": key})
	if st != http.StatusCreated {
		return st, "", "", body
	}
	id := body["order"].(map[string]any)["id"].(string)
	authority := ""
	if u, ok := body["redirectUrl"].(string); ok {
		authority = u[strings.LastIndex(u, "/")+1:]
	}
	return st, id, authority, body
}

// pay simulates the gateway page and the website's callback.
func (e *env) pay(orderID, authority string, ok bool) (int, string) {
	e.t.Helper()
	status := "NOK"
	if ok {
		if err := e.gw.Pay(e.t.Context(), authority); err != nil {
			e.t.Fatal(err)
		}
		status = "OK"
	}
	st, body, _ := e.call(http.MethodPost, "/v1/payments/verify", "", map[string]any{
		"orderId": orderID, "params": map[string]string{"Authority": authority, "Status": status},
	})
	s, _ := body["status"].(string)
	return st, s
}

// tier is the customer's current tier.
func (e *env) tier() string {
	e.t.Helper()
	_, body, _ := e.call(http.MethodGet, "/v1/me/entitlements", customer, nil)
	return body["tier"].(string)
}

func (e *env) countSubs(where string) int {
	e.t.Helper()
	var n int
	if err := e.pool.QueryRow(e.t.Context(), "SELECT count(*) FROM app.subscriptions WHERE "+where).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func TestCheckoutPayVerify(t *testing.T) {
	e := setup(t)

	if st, _, _, body := e.checkout(customer, "silver", "key-disabled"); st != http.StatusConflict || body["code"] != "PAYMENTS_DISABLED" {
		t.Fatalf("payments off: %d %v", st, body)
	}
	e.enablePayments(true)
	if st, _, _, _ := e.checkout("", "silver", "key-anon-1"); st != http.StatusUnauthorized {
		t.Fatalf("anonymous checkout: %d", st)
	}

	// Cancelled at the gateway → failed, still free.
	st, id, auth, _ := e.checkout(customer, "silver", "key-cancel-1")
	if st != http.StatusCreated || auth == "" {
		t.Fatalf("checkout: %d %s", st, auth)
	}
	if st, status := e.pay(id, auth, false); st != 200 || status != "failed" {
		t.Fatalf("cancel: %d %s", st, status)
	}
	if e.tier() != "free" {
		t.Fatal("a cancelled payment must not grant a plan")
	}

	// Idempotency: the same key returns the same order and payment page.
	_, id1, auth1, body := e.checkout(customer, "silver", "key-silver-1")
	_, id2, auth2, _ := e.checkout(customer, "silver", "key-silver-1")
	if id1 != id2 || auth1 != auth2 {
		t.Fatalf("idempotency: %s/%s vs %s/%s", id1, auth1, id2, auth2)
	}
	if amt := body["order"].(map[string]any)["amount"].(map[string]any)["amount"]; amt != "10000000" {
		t.Fatalf("silver month amount = %v", amt)
	}

	// A callback carrying another order's authority is refused.
	if st, _ := e.pay(id1, auth, true); st != http.StatusBadRequest {
		t.Fatalf("authority of another order: %d", st)
	}

	// Paid → verified server-side → plan active; repeating the callback changes nothing.
	if st, status := e.pay(id1, auth1, true); st != 200 || status != "paid" {
		t.Fatalf("pay: %d %s", st, status)
	}
	for range 3 {
		if st, status := e.pay(id1, auth1, true); st != 200 || status != "paid" {
			t.Fatalf("repeat verify: %d %s", st, status)
		}
	}
	if n := e.countSubs("order_id IS NOT NULL"); n != 1 {
		t.Fatalf("subscriptions after repeated callbacks = %d, want 1", n)
	}
	if e.tier() != "silver" {
		t.Fatal("silver not active after payment")
	}
	_, me, _ := e.call(http.MethodGet, "/v1/me", customer, nil)
	if me["tier"] != "silver" || me["current"] == nil || me["phone"] != "+989120000001" {
		t.Fatalf("me: %v", me)
	}
	_, orders, _ := e.call(http.MethodGet, "/v1/me/orders", customer, nil)
	items := orders["items"].([]any)
	if len(items) != 2 || items[0].(map[string]any)["refId"] == nil { // the attempt with payments off created no order
		t.Fatalf("orders: %v", orders)
	}

	// Renewal queues after the current month.
	_, q, _ := e.call(http.MethodPost, "/v1/checkout/quote", customer, map[string]any{"plan": "silver", "period": "month"})
	if q["kind"] != "renewal" {
		t.Fatalf("renewal quote: %v", q)
	}
	cur := me["current"].(map[string]any)["endsAt"].(string)
	if q["startsAt"] != cur {
		t.Fatalf("renewal starts %v, want %v", q["startsAt"], cur)
	}

	// Upgrade to gold: most of the silver month is credited.
	_, q, _ = e.call(http.MethodPost, "/v1/checkout/quote", customer, map[string]any{"plan": "gold", "period": "month"})
	// Just paid for 30 days: nearly the whole 10,000,000 Rial is credited.
	credit, _ := strconv.ParseInt(q["credit"].(map[string]any)["amount"].(string), 10, 64)
	if q["kind"] != "upgrade" || credit < 9_990_000 || credit > 10_000_000 {
		t.Fatalf("upgrade quote: %v", q)
	}
	_, gid, gauth, _ := e.checkout(customer, "gold", "key-gold-1")
	if _, status := e.pay(gid, gauth, true); status != "paid" {
		t.Fatalf("gold pay: %s", status)
	}
	if e.tier() != "gold" || e.countSubs("status = 'replaced'") != 1 {
		t.Fatal("upgrade must activate gold and replace silver")
	}
}

func TestRefunds(t *testing.T) {
	e := setup(t)
	e.enablePayments(true)
	e.seedPrices()
	_, id, auth, _ := e.checkout(customer, "silver", "key-refund-1")
	e.pay(id, auth, true)

	_, o, _ := e.call(http.MethodGet, "/v1/me/orders/"+id, customer, nil)
	if o["refundable"] != true {
		t.Fatalf("fresh unused order must be refundable: %v", o)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/me/orders/"+id, "silver", nil); st != 404 {
		t.Fatalf("another user's order must look missing: %d", st)
	}
	st, r, _ := e.call(http.MethodPost, "/v1/me/orders/"+id+"/refund", customer, map[string]any{"reason": "changed my mind"})
	if st != 201 || r["status"] != "requested" {
		t.Fatalf("request refund: %d %v", st, r)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/me/orders/"+id+"/refund", customer, nil); st != 409 {
		t.Fatalf("second request: %d", st)
	}
	refundID := r["id"].(string)
	decision := map[string]any{"decision": "approve", "note": "bank ref 123"}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/refunds/"+refundID+"/decision", "editor", decision); st != 403 {
		t.Fatalf("editor must not decide refunds: %d", st)
	}
	if st, body, _ := e.call(http.MethodPost, "/v1/admin/refunds/"+refundID+"/decision", "admin", decision); st != 200 || body["status"] != "approved" {
		t.Fatalf("approve: %d %v", st, body)
	}
	if e.tier() != "free" {
		t.Fatal("an approved refund must cancel the plan")
	}
	_, o, _ = e.call(http.MethodGet, "/v1/me/orders/"+id, customer, nil)
	if o["status"] != "refunded" || o["refundStatus"] != "approved" {
		t.Fatalf("order after refund: %v", o)
	}

	// Using a paid feature ends the refund right (SCOPE §6).
	_, id2, auth2, _ := e.checkout(customer, "silver", "key-refund-2")
	e.pay(id2, auth2, true)
	if _, _, raw := e.call(http.MethodGet, "/v1/prices", customer, nil); !strings.Contains(raw, "copper-lme") {
		t.Fatal("silver must see LME")
	}
	_, o, _ = e.call(http.MethodGet, "/v1/me/orders/"+id2, customer, nil)
	if o["refundable"] != false {
		t.Fatalf("used order must not be refundable: %v", o)
	}
	if st, body, _ := e.call(http.MethodPost, "/v1/me/orders/"+id2+"/refund", customer, nil); st != 409 || body["code"] != "NOT_REFUNDABLE" {
		t.Fatalf("refund after use: %d %v", st, body)
	}
}

func TestAdminUsersAndGrants(t *testing.T) {
	e := setup(t)
	e.call(http.MethodGet, "/v1/me", customer, nil) // creates the local profile

	st, body, _ := e.call(http.MethodGet, "/v1/admin/users?q=%DB%B0%DB%B9%DB%B1%DB%B2%DB%B0%DB%B0%DB%B0", "support", nil) // "۰۹۱۲۰۰۰" in Persian digits
	if st != 200 || len(body["items"].([]any)) != 1 {
		t.Fatalf("search: %d %v", st, body)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/users", customer, nil); st != 403 {
		t.Fatalf("customer listing users: %d", st)
	}

	grant := map[string]any{"userId": "00000000-0000-0000-0000-000000000001", "plan": "silver", "days": 10}
	e.call(http.MethodPost, "/v1/admin/subscriptions", "admin", grant)
	_, second, _ := e.call(http.MethodPost, "/v1/admin/subscriptions", "admin", grant)
	_, subs, _ := e.call(http.MethodGet, "/v1/me/subscriptions", customer, nil)
	items := subs["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("subscriptions: %v", subs)
	}
	first := items[1].(map[string]any)
	if second["startsAt"] != first["endsAt"] {
		t.Fatalf("a second grant must start when the first ends: %v vs %v", second["startsAt"], first["endsAt"])
	}
}

type fakeSMS struct{ sent []string }

func (f *fakeSMS) Name() string { return "fake" }
func (f *fakeSMS) Send(_ context.Context, to, body string) (int, error) {
	f.sent = append(f.sent, to+" "+body)
	return 1200, nil
}

var _ notify.SMS = (*fakeSMS)(nil)

func TestRenewalReminderOnce(t *testing.T) {
	e := setup(t)
	e.call(http.MethodGet, "/v1/me", customer, nil)
	if _, err := e.pool.Exec(t.Context(), `INSERT INTO app.site_settings (key, value) VALUES ('sms_templates',
		'{"subscription_expiring":{"fa":"اشتراک {plan} شما {date} تمام است. {url}"}}')
		ON CONFLICT (key) DO NOTHING`); err != nil {
		t.Fatal(err)
	}
	// Ends in 2 days: due. Nothing queued after it.
	if _, err := e.pool.Exec(t.Context(), `INSERT INTO app.subscriptions (user_id, plan_code, starts_at, ends_at)
		VALUES ('00000000-0000-0000-0000-000000000001', 'gold', now() - interval '28 days', now() + interval '2 days')`); err != nil {
		t.Fatal(err)
	}
	sms := &fakeSMS{}
	n, err := e.billing.SendReminders(t.Context(), sms, "https://alanfelez.ir/plans")
	if err != nil || n != 1 || !strings.Contains(sms.sent[0], "+989120000001") || !strings.Contains(sms.sent[0], "طلایی") {
		t.Fatalf("first run: %d %v %v", n, err, sms.sent)
	}
	if n, _ := e.billing.SendReminders(t.Context(), sms, "https://alanfelez.ir/plans"); n != 0 {
		t.Fatalf("second run sent %d, want 0", n)
	}
	var cost int
	_ = e.pool.QueryRow(t.Context(), `SELECT cost_rial FROM app.notifications`).Scan(&cost)
	if cost != 1200 {
		t.Fatalf("notification cost = %d", cost)
	}

}
