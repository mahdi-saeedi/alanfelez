package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

type fakeVerifier map[string]*Principal

func (f fakeVerifier) Verify(_ context.Context, raw string) (*Principal, error) {
	if p, ok := f[raw]; ok {
		return p, nil
	}
	return nil, errors.New("bad token")
}

func TestMiddleware(t *testing.T) {
	alice := &Principal{Username: "alice", Roles: []string{RoleStaff, RoleEditor}}
	var seen *Principal
	h := Middleware(fakeVerifier{"good": alice}, func(w http.ResponseWriter, _ *http.Request, _ error) {
		w.WriteHeader(http.StatusUnauthorized)
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = FromContext(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))

	cases := []struct {
		name, header string
		status       int
		want         *Principal
	}{
		{"anonymous", "", http.StatusNoContent, nil},
		{"valid token", "Bearer good", http.StatusNoContent, alice},
		{"invalid token is rejected, not anonymous", "Bearer forged", http.StatusUnauthorized, nil},
		{"not a bearer token", "Basic Zm9vOmJhcg==", http.StatusUnauthorized, nil},
		{"empty bearer", "Bearer ", http.StatusUnauthorized, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			seen = nil
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
			if c.header != "" {
				req.Header.Set("Authorization", c.header)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != c.status {
				t.Fatalf("status = %d, want %d", rec.Code, c.status)
			}
			if seen != c.want {
				t.Fatalf("principal = %+v, want %+v", seen, c.want)
			}
		})
	}
}

func TestRoles(t *testing.T) {
	var anon *Principal
	if anon.HasRole(RoleStaff) || anon.HasAnyRole(RoleAdmin, RoleEditor) {
		t.Fatal("anonymous must have no roles")
	}
	p := &Principal{Roles: []string{RoleStaff, RoleEditor}}
	if !p.HasRole(RoleEditor) || p.HasRole(RoleAdmin) || !p.HasAnyRole(RoleAdmin, RoleEditor) {
		t.Fatal("role checks are wrong")
	}
}

func TestMergeRoles(t *testing.T) {
	got := mergeRoles([]string{RoleStaff, "default-roles-alanfelez"}, []string{RoleStaff, RoleEditor})
	want := []string{RoleStaff, "default-roles-alanfelez", RoleEditor}
	if !slices.Equal(got, want) {
		t.Fatalf("mergeRoles = %v, want %v", got, want)
	}
	if got := mergeRoles(nil, []string{RoleAdmin}); !slices.Equal(got, []string{RoleAdmin}) {
		t.Fatalf("flat only = %v", got)
	}
}
