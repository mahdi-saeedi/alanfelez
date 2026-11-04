//go:build integration

package api_test

import (
	"context"
	"net/http"
	"slices"
	"testing"

	"github.com/alanfelez/alanfelez/services/api/internal/api"
	"github.com/alanfelez/alanfelez/services/api/internal/identity"
)

// fakeStaff is Keycloak's staff accounts in memory.
type fakeStaff struct {
	users     []identity.StaffUser
	passwords map[string]string
}

func (f *fakeStaff) ListStaff(context.Context) ([]identity.StaffUser, error) { return f.users, nil }
func (f *fakeStaff) CreateStaff(_ context.Context, n identity.NewStaff) (string, error) {
	if slices.ContainsFunc(f.users, func(u identity.StaffUser) bool { return u.Username == n.Username }) {
		return "", identity.ErrUsernameTaken
	}
	id := "00000000-0000-0000-0000-0000000000f1"
	f.users = append(f.users, identity.StaffUser{ID: id, Username: n.Username, FirstName: n.FirstName, LastName: n.LastName, Role: n.Role, Enabled: true})
	f.passwords[id] = n.Password
	return id, nil
}
func (f *fakeStaff) find(id string) *identity.StaffUser {
	for i := range f.users {
		if f.users[i].ID == id {
			return &f.users[i]
		}
	}
	return nil
}
func (f *fakeStaff) SetStaffRole(_ context.Context, id, role string) error {
	f.find(id).Role = role
	return nil
}
func (f *fakeStaff) SetEnabled(_ context.Context, id string, on bool) error {
	f.find(id).Enabled = on
	return nil
}
func (f *fakeStaff) ResetPassword(_ context.Context, id, pw string) error {
	f.passwords[id] = pw
	return nil
}

// Staff accounts from the admin (client and owner, 2026-11-04): admin only, audited, never the admin's own account.
func TestStaffAccounts(t *testing.T) {
	kc := &fakeStaff{passwords: map[string]string{}, users: []identity.StaffUser{
		{ID: "00000000-0000-0000-0000-00000000000a", Username: "admin", Role: "admin", Enabled: true},
	}}
	e := setup(t, api.WithStaffDirectory(kc))
	newStaff := map[string]any{"username": "sales.ali", "firstName": "علی", "lastName": "فروش", "role": "staff", "password": "Temp-12345!"}
	for _, c := range []struct {
		tok  string
		want int
	}{{"", 401}, {"editor", 403}, {"support", 403}} {
		if st, _, _ := e.call(http.MethodPost, "/v1/admin/staff", c.tok, newStaff); st != c.want {
			t.Fatalf("create as %q: %d", c.tok, st)
		}
		if st, _, _ := e.call(http.MethodGet, "/v1/admin/staff", c.tok, nil); st != c.want {
			t.Fatalf("list as %q: %d", c.tok, st)
		}
	}
	for _, bad := range []map[string]any{
		{"username": "09121234567", "firstName": "a", "lastName": "b", "role": "staff", "password": "Temp-12345!"}, // a phone number
		{"username": "sales.ali", "firstName": "a", "lastName": "b", "role": "owner", "password": "Temp-12345!"},   // unknown role
		{"username": "sales.ali", "firstName": "a", "lastName": "b", "role": "staff", "password": "short"},         // short password
	} {
		if st, _, _ := e.call(http.MethodPost, "/v1/admin/staff", "admin", bad); st != 400 {
			t.Fatalf("bad %v: %d", bad, st)
		}
	}
	st, body, raw := e.call(http.MethodPost, "/v1/admin/staff", "admin", newStaff)
	if st != 201 || body["role"] != "staff" || kc.passwords["00000000-0000-0000-0000-0000000000f1"] != "Temp-12345!" {
		t.Fatalf("create: %d %s", st, raw)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/staff", "admin", newStaff); st != 409 {
		t.Fatalf("taken: %d", st)
	}
	id := body["id"].(string)
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/staff/"+id, "admin", map[string]any{"role": "support", "enabled": false}); st != 204 || kc.users[1].Role != "support" || kc.users[1].Enabled {
		t.Fatalf("update: %d %+v", st, kc.users[1])
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/staff/"+id+"/password", "admin", map[string]any{"password": "Another-123!"}); st != 204 || kc.passwords[id] != "Another-123!" {
		t.Fatalf("reset: %d", st)
	}
	// Not one's own account, and never a customer.
	if st, _, _ := e.call(http.MethodPut, "/v1/admin/staff/00000000-0000-0000-0000-00000000000a", "admin", map[string]any{"enabled": false}); st != 409 {
		t.Fatalf("own account: %d", st)
	}
	if st, _, _ := e.call(http.MethodPost, "/v1/admin/staff/00000000-0000-0000-0000-000000000001/password", "admin", map[string]any{"password": "Another-123!"}); st != 404 {
		t.Fatalf("a customer: %d", st)
	}
	if _, list, _ := e.call(http.MethodGet, "/v1/admin/staff", "admin", nil); len(list["items"].([]any)) != 2 {
		t.Fatalf("list: %v", list)
	}
	if n := e.count(`SELECT count(*) FROM app.audit_log WHERE action LIKE 'staff.%' AND data::text NOT LIKE '%Temp-12345%' AND data::text NOT LIKE '%Another-123%'`); n != 3 {
		t.Fatalf("audit rows without passwords: %d", n)
	}
}

// Without the Keycloak service account the page says so.
func TestStaffAccountsOff(t *testing.T) {
	e := setup(t)
	if st, _, _ := e.call(http.MethodGet, "/v1/admin/staff", "admin", nil); st != 503 {
		t.Fatalf("off: %d", st)
	}
}
