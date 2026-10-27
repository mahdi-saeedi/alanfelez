//go:build integration

package api_test

import (
	"context"
	"net/http"
	"slices"
	"testing"

	"github.com/alanfelez/alanfelez/services/api/internal/api"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/identity"
)

// fakeIdentity is Keycloak with the test principals as its users.
type fakeIdentity struct{ deleted []string }

func (f *fakeIdentity) RealmRoles(_ context.Context, id string) ([]string, error) {
	if slices.Contains(f.deleted, id) {
		return nil, identity.ErrUserNotFound
	}
	for _, p := range principals {
		if p.ID.Valid && uuidOf(p) == id {
			return p.Roles, nil
		}
	}
	return nil, identity.ErrUserNotFound
}

func (f *fakeIdentity) DeleteUser(_ context.Context, id string) error {
	f.deleted = append(f.deleted, id)
	return nil
}

func uuidOf(p *auth.Principal) string {
	v, _ := p.ID.Value()
	return v.(string)
}

func TestAdminDeleteUser(t *testing.T) {
	kc := &fakeIdentity{}
	e := setup(t, api.WithIdentity(kc))
	const id = "00000000-0000-0000-0000-000000000001" // customer
	path := "/v1/admin/users/" + id
	e.call(http.MethodGet, "/v1/me", customer, nil) // creates the local profile
	for _, sql := range []string{
		`INSERT INTO app.sms_prefs (user_id, enabled) VALUES ($1, true)`,
		`INSERT INTO app.notifications (user_id, channel, template, recipient, body, provider, dedupe_key)
		 VALUES ($1, 'sms', 'price_update', '+989120000001', 'x', 'console', 'k1')`,
	} {
		if _, err := e.pool.Exec(t.Context(), sql, id); err != nil {
			t.Fatal(err)
		}
	}

	if st, _, _ := e.call(http.MethodDelete, path, "editor", nil); st != 403 {
		t.Fatalf("editor deleting: %d", st)
	}
	if st, _, _ := e.call(http.MethodDelete, path, customer, nil); st != 403 {
		t.Fatalf("customer deleting: %d", st)
	}
	if st, b, _ := e.call(http.MethodDelete, "/v1/admin/users/00000000-0000-0000-0000-00000000000e", "admin", nil); st != 409 {
		t.Fatalf("deleting a staff account: %d %v", st, b)
	}
	if st, _, _ := e.call(http.MethodDelete, "/v1/admin/users/00000000-0000-0000-0000-00000000000a", "admin", nil); st != 409 {
		t.Fatalf("deleting yourself: %d", st)
	}

	if st, b, _ := e.call(http.MethodDelete, path, "admin", nil); st != 204 {
		t.Fatalf("delete: %d %v", st, b)
	}
	if !slices.Contains(kc.deleted, id) {
		t.Fatal("the Keycloak account must be deleted")
	}
	for sql, want := range map[string]int{
		`SELECT count(*) FROM app.users WHERE username = 'deleted' AND phone_e164 IS NULL AND activity IS NULL AND metals IS NULL AND deleted_at IS NOT NULL`: 1,
		`SELECT count(*) FROM app.sms_prefs`:                                                           0,
		`SELECT count(*) FROM app.notifications WHERE recipient = ''`:                                  1,
		`SELECT count(*) FROM app.audit_log WHERE action = 'user.delete' AND entity_id = '` + id + `'`: 1,
	} {
		if got := e.count(sql); got != want {
			t.Errorf("%s = %d, want %d", sql, got, want)
		}
	}

	// The user's last access token is still valid for a few minutes: it must not write the details back.
	if st, _, _ := e.call(http.MethodGet, "/v1/me", customer, nil); st != 200 {
		t.Fatalf("me after delete: %d", st)
	}
	if e.count(`SELECT count(*) FROM app.users WHERE username = 'deleted' AND activity IS NULL`) != 1 {
		t.Fatal("a deleted profile was filled in again")
	}
	_, list, _ := e.call(http.MethodGet, "/v1/admin/users?q="+id[:8], "admin", nil)
	if u := list["items"].([]any)[0].(map[string]any); u["deletedAt"] == nil || u["phone"] != nil {
		t.Fatalf("listed: %v", u)
	}

	if st, _, _ := e.call(http.MethodDelete, path, "admin", nil); st != 404 {
		t.Fatalf("deleting twice: %d", st)
	}
}

func TestAdminDeleteUserNotSetUp(t *testing.T) {
	e := setup(t)
	st, b, _ := e.call(http.MethodDelete, "/v1/admin/users/00000000-0000-0000-0000-000000000001", "admin", nil)
	if st != 503 || b["code"] != "UPSTREAM_UNAVAILABLE" {
		t.Fatalf("without Keycloak: %d %v", st, b)
	}
}
