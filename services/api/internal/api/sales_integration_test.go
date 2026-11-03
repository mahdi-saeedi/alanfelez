//go:build integration

package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/api"
)

// Staff accounts (admin «پرسنل»): admins create and change them; everyone else is refused; nobody locks themselves out.
func TestStaffAccounts(t *testing.T) {
	kc := &fakeIdentity{}
	e := setup(t, api.WithIdentity(kc))
	good := map[string]any{"username": "sales.ali", "firstName": "علی", "lastName": "فروش", "password": "a-long-password", "roles": []string{"sales"}, "temporary": true}

	for tok, want := range map[string]int{"": 401, "user": 403, "editor": 403, "support": 403, "sales": 403} {
		if st, _, _ := e.call(http.MethodPost, "/v1/admin/staff", tok, good); st != want {
			t.Fatalf("create as %q: %d, want %d", tok, st, want)
		}
	}
	for _, bad := range []map[string]any{
		{"username": "09121234567", "firstName": "x", "password": "a-long-password", "roles": []string{"sales"}}, // a mobile number
		{"username": "Ali Reza", "firstName": "x", "password": "a-long-password", "roles": []string{"sales"}},
		{"username": "ali", "firstName": "x", "password": "short", "roles": []string{"sales"}},
		{"username": "ali", "firstName": "x", "password": "a-long-password", "roles": []string{"owner"}},
		{"username": "ali", "firstName": "x", "password": "a-long-password", "roles": []string{}},
		{"username": "ali", "firstName": "", "password": "a-long-password", "roles": []string{"sales"}},
	} {
		if st, _, raw := e.call(http.MethodPost, "/v1/admin/staff", "admin", bad); st != 400 {
			t.Fatalf("bad %v: %d %s", bad, st, raw)
		}
	}
	st, body, raw := e.call(http.MethodPost, "/v1/admin/staff", "admin", good)
	if st != 201 || body["username"] != "sales.ali" || body["enabled"] != true {
		t.Fatalf("create: %d %s", st, raw)
	}
	id := body["id"].(string)
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/staff", "admin", good); st != 409 {
		t.Fatalf("same username: %d", st)
	}
	// Every staff member reads the list (to assign customers).
	if st, body, raw := e.call(http.MethodGet, "/v1/admin/staff", "sales", nil); st != 200 || !strings.Contains(raw, "sales.ali") || len(body["items"].([]any)) < 5 {
		t.Fatalf("list: %d %s", st, raw)
	}

	upd := map[string]any{"firstName": "علی", "lastName": "رضایی", "roles": []string{"sales", "support"}, "enabled": false}
	if st, _, raw := e.call(http.MethodPut, "/v1/admin/staff/"+id, "admin", upd); st != 200 || !strings.Contains(raw, `"enabled":false`) {
		t.Fatalf("update: %d %s", st, raw)
	}
	// An admin can't take away their own roles or access.
	self := "/v1/admin/staff/00000000-0000-0000-0000-00000000000a"
	if st, _, _ := e.call(http.MethodPut, self, "admin", map[string]any{"firstName": "A", "roles": []string{"sales"}, "enabled": true}); st != 409 {
		t.Fatalf("own roles: %d", st)
	}
	if st, _, _ := e.call(http.MethodPut, self, "admin", map[string]any{"firstName": "A", "roles": []string{"admin"}, "enabled": false}); st != 409 {
		t.Fatalf("own access: %d", st)
	}
	// Customers' accounts are never changed here.
	customer := "/v1/admin/staff/00000000-0000-0000-0000-000000000001"
	if st, _, _ := e.call(http.MethodPost, customer+"/password", "admin", map[string]any{"password": "a-long-password"}); st != 404 {
		t.Fatalf("customer password: %d", st)
	}
	if st, _, _ := e.call(http.MethodPut, customer, "admin", upd); st != 404 {
		t.Fatalf("customer update: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/staff/"+id+"/password", "admin", map[string]any{"password": "new-long-password"}); st != 204 {
		t.Fatalf("password: %d", st)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action IN ('staff.create', 'staff.update', 'staff.password')`); n != 3 {
		t.Fatalf("audits = %d", n)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE data::text LIKE '%long-password%'`); n != 0 {
		t.Fatal("a password reached the audit log")
	}

	// Without the Keycloak service account the page says so.
	e2 := setup(t)
	if st, body, _ := e2.call(http.MethodGet, "/v1/admin/staff", "admin", nil); st != 503 || body["code"] != "UPSTREAM_UNAVAILABLE" {
		t.Fatalf("no identity: %d %v", st, body)
	}
}

// Sales follow-up, call lists, opportunities and the sales report.
func TestSalesFollowup(t *testing.T) {
	kc := &fakeIdentity{}
	e := setup(t, api.WithIdentity(kc))
	ctx := t.Context()
	e.call(http.MethodGet, "/v1/me", "user", nil)   // creates the customers' rows
	e.call(http.MethodGet, "/v1/me", "silver", nil) //
	e.call(http.MethodGet, "/v1/me", "gold", nil)   //
	const u1 = "00000000-0000-0000-0000-000000000001"
	card := "/v1/admin/sales/" + u1
	today := time.Now().In(time.FixedZone("IRST", 12600)).Format(time.DateOnly)

	// Who may write: sales staff and admins; everyone in the staff reads.
	lead := map[string]any{"stage": "interested", "nextAt": today, "ownerId": "00000000-0000-0000-0000-00000000000d"}
	for tok, want := range map[string]int{"": 401, "user": 403, "support": 403, "editor": 403} {
		if st, _, _ := e.call(http.MethodPut, card+"/lead", tok, lead); st != want {
			t.Fatalf("lead as %q: %d, want %d", tok, st, want)
		}
	}
	st, body, raw := e.call(http.MethodPut, card+"/lead", "sales", lead)
	if st != 200 || body["stage"] != "interested" || body["ownerName"] != "Sara Sales" || body["nextAt"] != today {
		t.Fatalf("lead: %d %s", st, raw)
	}
	if st, _, _ := e.call(http.MethodPut, card+"/lead", "sales", map[string]any{"stage": "maybe"}); st != 400 {
		t.Fatalf("bad stage: %d", st)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/sales/00000000-0000-0000-0000-0000000000ff/lead", "sales", lead); st != 404 {
		t.Fatalf("unknown user: %d", st)
	}
	for _, bad := range []map[string]any{{"kind": "note"}, {"kind": "note", "body": "x", "outcome": "answered"}, {"kind": "sms", "body": "x"}} {
		if st, _, _ := e.call(http.MethodPost, card+"/notes", "sales", bad); st != 400 {
			t.Fatalf("bad note %v: %d", bad, st)
		}
	}
	if st, _, raw := e.call(http.MethodPost, card+"/notes", "sales", map[string]any{"kind": "call", "outcome": "answered", "body": "مس کاتد می\u200cخواهد"}); st != 201 || !strings.Contains(raw, "Sara Sales") {
		t.Fatalf("call: %d %s", st, raw)
	}
	if st, body, raw := e.call(http.MethodGet, card, "support", nil); st != 200 || len(body["notes"].([]any)) != 1 || body["lead"] == nil {
		t.Fatalf("card: %d %s", st, raw)
	}
	if _, body, raw := e.call(http.MethodGet, "/v1/admin/sales/followups", "support", nil); len(body["items"].([]any)) != 1 || !strings.Contains(raw, "مس کاتد") {
		t.Fatalf("follow-ups: %s", raw)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/admin/sales/followups?owner=00000000-0000-0000-0000-00000000000a", "support", nil); len(body["items"].([]any)) != 0 {
		t.Fatal("follow-ups of another owner")
	}
	if _, body, raw := e.call(http.MethodGet, "/v1/admin/dashboard", "support", nil); body["followupsDue"].(float64) != 1 {
		t.Fatalf("dashboard follow-ups: %s", raw)
	}

	// Call lists: a Gold plan (granted) ending in 3 days; a Silver plan bought 15 days ago.
	for _, sql := range []string{
		`INSERT INTO app.subscriptions (user_id, plan_code, starts_at, ends_at) VALUES ('` + u1 + `', 'gold', now() - interval '27 days', now() + interval '3 days')`,
		`INSERT INTO app.subscriptions (user_id, plan_code, starts_at, ends_at) VALUES ('00000000-0000-0000-0000-000000000002', 'silver', now() - interval '15 days', now() + interval '15 days')`,
	} {
		if _, err := e.pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	_, body, raw = e.call(http.MethodGet, "/v1/admin/sales/calls?kind=renewal", "support", nil)
	if items := body["items"].([]any); len(items) != 1 || items[0].(map[string]any)["userId"] != u1 || items[0].(map[string]any)["stage"] != "interested" || body["minDays"].(float64) != 2 {
		t.Fatalf("renewal calls: %s", raw)
	}
	if st, _, _ := e.call(http.MethodPost, card+"/notes", "sales", map[string]any{"kind": "renewal_call", "outcome": "call_back"}); st != 201 {
		t.Fatalf("renewal call: %d", st)
	}
	if _, _, raw := e.call(http.MethodGet, "/v1/admin/sales/calls?kind=renewal", "support", nil); !strings.Contains(raw, `"outcome":"call_back"`) {
		t.Fatalf("last call: %s", raw)
	}
	if _, body, raw := e.call(http.MethodGet, "/v1/admin/sales/calls?kind=renewal&minDays=5&maxDays=9", "support", nil); len(body["items"].([]any)) != 0 {
		t.Fatalf("other window: %s", raw)
	}
	_, body, raw = e.call(http.MethodGet, "/v1/admin/sales/calls?kind=feedback", "support", nil)
	if items := body["items"].([]any); len(items) != 1 || items[0].(map[string]any)["plan"] != "silver" || items[0].(map[string]any)["paid"] != false {
		t.Fatalf("feedback calls: %s", raw)
	}
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/sales/calls?kind=feedback&minDays=9&maxDays=3", "support", nil); st != 400 {
		t.Fatalf("min > max: %d", st)
	}

	// Opportunities: Free and Silver users only.
	const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
	for i, tok := range []string{"user", "gold"} {
		view := map[string]any{"path": "/prices?metal=copper", "view": "aaaaaaaa-aaaa-4aaa-8aaa-00000000000" + string(rune('1'+i))}
		e.callH(http.MethodPost, "/v1/visits", tok, view, map[string]string{"User-Agent": chrome})
	}
	e.grantGold()
	_, body, raw = e.call(http.MethodGet, "/v1/admin/activity?upgradable=true", "support", nil)
	if body["total"].(float64) != 0 {
		// The user now holds Gold (granted above in the call lists), so nobody is left.
		t.Fatalf("upgradable: %s", raw)
	}
	if _, err := e.pool.Exec(ctx, `UPDATE app.subscriptions SET status = 'cancelled' WHERE user_id = '`+u1+`'`); err != nil {
		t.Fatal(err)
	}
	_, body, raw = e.call(http.MethodGet, "/v1/admin/activity?upgradable=true&minDays=1", "support", nil)
	if items := body["items"].([]any); len(items) != 1 || items[0].(map[string]any)["userId"] != u1 || items[0].(map[string]any)["leadStage"] != "interested" {
		t.Fatalf("upgradable: %s", raw)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/admin/activity?minDays=2", "support", nil); body["total"].(float64) != 0 {
		t.Fatal("minDays")
	}

	// Sales report: two paid orders yesterday, one refunded today.
	for _, sql := range []string{
		`INSERT INTO app.orders (user_id, plan_price_id, plan_code, period, kind, price_rial, amount_rial, starts_at, status, idempotency_key, expires_at, paid_at)
		 SELECT '` + u1 + `', pp.id, 'gold', 'month', 'new', 5000000, 5000000, now(), 'paid', 'k1', now(), now() - interval '1 day' FROM app.plan_prices pp WHERE pp.plan_code = 'gold' LIMIT 1`,
		`INSERT INTO app.orders (user_id, plan_price_id, plan_code, period, kind, price_rial, amount_rial, starts_at, status, idempotency_key, expires_at, paid_at)
		 SELECT '` + u1 + `', pp.id, 'silver', 'year', 'renewal', 9000000, 8000000, now(), 'refunded', 'k2', now(), now() - interval '1 day' FROM app.plan_prices pp WHERE pp.plan_code = 'silver' LIMIT 1`,
		`INSERT INTO app.refunds (order_id, amount_rial, status, decided_at) SELECT o.id, 8000000, 'approved', now() FROM app.orders o WHERE o.idempotency_key = 'k2'`,
	} {
		if _, err := e.pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	for tok, want := range map[string]int{"": 401, "user": 403, "sales": 200} {
		if st, _, _ := e.call(http.MethodGet, "/v1/admin/reports/sales", tok, nil); st != want {
			t.Fatalf("report as %q: %d, want %d", tok, st, want)
		}
	}
	_, body, raw = e.call(http.MethodGet, "/v1/admin/reports/sales?group=day", "admin", nil)
	tot := body["totals"].(map[string]any)
	if tot["orders"].(float64) != 2 || tot["revenue"].(map[string]any)["amount"] != "13000000" || tot["refunds"].(float64) != 1 ||
		tot["net"].(map[string]any)["amount"] != "5000000" || len(body["periods"].([]any)) != 30 || len(body["byPlan"].([]any)) != 2 || len(body["byKind"].([]any)) != 2 {
		t.Fatalf("report: %s", raw)
	}
	if _, body, raw = e.call(http.MethodGet, "/v1/admin/reports/sales?group=month&from=2026-03-21&to=2026-05-22", "admin", nil); len(body["periods"].([]any)) != 3 ||
		!strings.Contains(raw, `"end":"2026-04-20"`) || !strings.Contains(raw, `"start":"2026-04-21"`) {
		t.Fatalf("Jalali months: %s", raw)
	}
	if st, _, raw := e.call(http.MethodGet, "/v1/admin/reports/sales/export", "admin", nil); st != 200 || !strings.Contains(raw, "500000") || !strings.HasPrefix(raw, "\xef\xbb\xbf") {
		t.Fatalf("export: %d %q", st, raw)
	}
}
