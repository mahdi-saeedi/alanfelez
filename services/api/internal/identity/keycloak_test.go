package identity

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

// fakeKeycloak serves the token endpoint and one known user (u1, roles staff + default-roles).
func fakeKeycloak(t *testing.T, tokens *int) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /realms/alanfelez/protocol/openid-connect/token", func(w http.ResponseWriter, r *http.Request) {
		if r.FormValue("client_id") != "api-admin" || r.FormValue("client_secret") != "s3cret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		*tokens++
		_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":300}`))
	})
	auth := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer tok" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			h(w, r)
		}
	}
	mux.HandleFunc("GET /admin/realms/alanfelez/users/{id}/role-mappings/realm/composite", auth(func(w http.ResponseWriter, r *http.Request) {
		if r.PathValue("id") != "u1" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(`[{"name":"staff"},{"name":"default-roles-alanfelez"}]`))
	}))
	mux.HandleFunc("DELETE /admin/realms/alanfelez/users/{id}", auth(func(w http.ResponseWriter, r *http.Request) {
		if r.PathValue("id") != "u1" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestKeycloak(t *testing.T) {
	tokens := 0
	srv := fakeKeycloak(t, &tokens)
	k := NewKeycloak(srv.URL+"/", "alanfelez", "api-admin", "s3cret")
	ctx := context.Background()

	roles, err := k.RealmRoles(ctx, "u1")
	if err != nil || !slices.Contains(roles, "staff") {
		t.Fatalf("roles: %v %v", roles, err)
	}
	if _, err := k.RealmRoles(ctx, "nobody"); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("unknown user: %v", err)
	}
	if err := k.DeleteUser(ctx, "u1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if err := k.DeleteUser(ctx, "nobody"); err != nil {
		t.Fatalf("delete of a missing user must succeed: %v", err)
	}
	if tokens != 1 {
		t.Fatalf("the token must be cached, fetched %d times", tokens)
	}

	bad := NewKeycloak(srv.URL, "alanfelez", "api-admin", "wrong")
	if err := bad.DeleteUser(ctx, "u1"); err == nil {
		t.Fatal("a wrong secret must fail")
	}
	if NewKeycloak(srv.URL, "alanfelez", "api-admin", "") != nil {
		t.Fatal("no secret = feature off (nil)")
	}
}
