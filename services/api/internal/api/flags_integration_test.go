//go:build integration

package api_test

import (
	"net/http"
	"testing"

	"github.com/alanfelez/alanfelez/services/api/internal/api"
)

func TestAdminFlags(t *testing.T) {
	e := setup(t) // the test gateway: payments can't be switched on
	for tok, want := range map[string]int{"": 401, "user": 403} {
		if st, _, _ := e.call(http.MethodGet, "/v1/admin/flags", tok, nil); st != want {
			t.Fatalf("%q list: %d, want %d", tok, st, want)
		}
	}
	st, body, raw := e.call(http.MethodGet, "/v1/admin/flags", "support", nil)
	if st != 200 || len(body["items"].([]any)) != 3 {
		t.Fatalf("list: %d %s", st, raw)
	}

	on := map[string]any{"enabled": true}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/flags/locale.en", "editor", on); st != 403 {
		t.Fatalf("editor: %d", st)
	}
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/flags/prices.four_eyes", "admin", on); st != 404 {
		t.Fatalf("unlisted flag: %d", st)
	}
	if st, body, raw := e.call(http.MethodPut, "/v1/admin/flags/locale.en", "admin", on); st != 200 || body["enabled"] != true {
		t.Fatalf("set: %d %s", st, raw)
	}
	if _, body, _ := e.call(http.MethodGet, "/v1/site", "", nil); body["englishSite"] != true {
		t.Fatal("the site didn't see the flag")
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action = 'flag.set' AND entity_id = 'locale.en'`); n != 1 {
		t.Fatalf("audit rows = %d", n)
	}
	if st, body, raw := e.call(http.MethodPut, "/v1/admin/flags/payments.enabled", "admin", on); st != 409 || body["status"] != 409.0 {
		t.Fatalf("payments with the test gateway: %d %s", st, raw)
	}
	if st, _, raw := e.call(http.MethodPut, "/v1/admin/flags/payments.enabled", "admin", map[string]any{"enabled": false}); st != 200 {
		t.Fatalf("payments off: %d %s", st, raw)
	}

	withGateway := setup(t, api.WithGateway("zarinpal"))
	if st, body, raw := withGateway.call(http.MethodPut, "/v1/admin/flags/payments.enabled", "admin", on); st != 200 || body["enabled"] != true || body["locked"] != false {
		t.Fatalf("payments with a real gateway: %d %s", st, raw)
	}
}
