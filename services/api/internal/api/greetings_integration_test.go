//go:build integration

package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// The welcome SMS goes once per mobile number ever; the thank-you SMS once per plan bought (client, 2026-11-04).
func TestGreetingSMS(t *testing.T) {
	e := setup(t)
	for _, tok := range []string{"user", "gold"} {
		e.call(http.MethodGet, "/v1/me", tok, nil) // new accounts with their phones
	}
	e.grantGold() // a staff grant (origin manual): no thank-you
	sms := &fakeSMS{}
	n, err := e.billing.SendGreetings(t.Context(), sms)
	all := strings.Join(sms.sent, "\n")
	if err != nil || n != 2 || !strings.Contains(all, "+989120000001 welcome") || !strings.Contains(all, "به الان\u200cفلز خوش آمدید") || strings.Contains(all, "purchase_thanks") {
		t.Fatalf("welcome: %d %v\n%s", n, err, all)
	}
	if n, _ := e.billing.SendGreetings(t.Context(), sms); n != 0 {
		t.Fatalf("second run sent %d", n)
	}

	// The account is deleted and the same number signs up again: no second welcome.
	if _, err := e.pool.Exec(t.Context(), `DELETE FROM app.notifications; DELETE FROM app.subscriptions WHERE user_id = '00000000-0000-0000-0000-000000000001'`); err != nil {
		t.Fatal(err)
	}
	if n, _ := e.billing.SendGreetings(t.Context(), sms); n != 0 {
		t.Fatalf("welcomed again: %v", sms.sent)
	}

	// A plan bought (origin order): one thank-you with the plan and its end date.
	if _, err := e.pool.Exec(t.Context(), `INSERT INTO app.subscriptions (user_id, plan_code, ends_at, origin)
		VALUES ('00000000-0000-0000-0000-000000000001', 'silver', now() + interval '30 days', 'order')`); err != nil {
		t.Fatal(err)
	}
	if n, err := e.billing.SendGreetings(t.Context(), sms); err != nil || n != 1 {
		t.Fatalf("thanks: %d %v", n, err)
	}
	if got := sms.sent[len(sms.sent)-1]; !strings.HasPrefix(got, "+989120000001 purchase_thanks") || !strings.Contains(got, "اشتراک نقره\u200cای شما تا تاریخ") {
		t.Fatalf("thanks text: %s", got)
	}
	if n, _ := e.billing.SendGreetings(t.Context(), sms); n != 0 {
		t.Fatal("thanked twice")
	}
}
