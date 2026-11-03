package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
)

// fakeRealm is a tiny in-memory Keycloak: users, the realm roles admin/editor/support/sales/staff, credentials.
type fakeRealm struct {
	mu    sync.Mutex
	users map[string]map[string]any
	roles map[string][]string // user id → direct realm roles
	otp   map[string]bool
	seq   int
}

func newFakeRealm(t *testing.T) (*Keycloak, *fakeRealm) {
	t.Helper()
	f := &fakeRealm{users: map[string]map[string]any{}, roles: map[string][]string{}, otp: map[string]bool{}}
	all := []string{"admin", "editor", "support", "sales", "staff", "default-roles-alanfelez"}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /realms/alanfelez/protocol/openid-connect/token", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":300}`))
	})
	const p = "/admin/realms/alanfelez"
	mux.HandleFunc("POST "+p+"/users", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		var u map[string]any
		_ = json.NewDecoder(r.Body).Decode(&u)
		for _, x := range f.users {
			if x["username"] == u["username"] {
				w.WriteHeader(http.StatusConflict)
				return
			}
		}
		if creds, _ := u["credentials"].([]any); len(creds) == 0 || len(creds[0].(map[string]any)["value"].(string)) < 4 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		f.seq++
		id := fmt.Sprintf("id%d", f.seq)
		delete(u, "credentials")
		u["id"], u["createdTimestamp"] = id, 1700000000000
		f.users[id] = u
		w.Header().Set("Location", "http://kc"+p+"/users/"+id)
		w.WriteHeader(http.StatusCreated)
	})
	mux.HandleFunc("GET "+p+"/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		u, ok := f.users[r.PathValue("id")]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(u)
	})
	mux.HandleFunc("PUT "+p+"/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		var u map[string]any
		_ = json.NewDecoder(r.Body).Decode(&u)
		f.users[r.PathValue("id")] = u
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST "+p+"/users/{id}/logout", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("PUT "+p+"/users/{id}/reset-password", func(w http.ResponseWriter, r *http.Request) {
		var c kcCredential
		_ = json.NewDecoder(r.Body).Decode(&c)
		if len(c.Value) < 4 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET "+p+"/users/{id}/credentials", func(w http.ResponseWriter, r *http.Request) {
		if f.otp[r.PathValue("id")] {
			_, _ = w.Write([]byte(`[{"type":"password"},{"type":"otp"}]`))
			return
		}
		_, _ = w.Write([]byte(`[{"type":"password"}]`))
	})
	reps := func(names []string) []kcRole {
		out := []kcRole{}
		for _, n := range names {
			out = append(out, kcRole{ID: "r-" + n, Name: n})
		}
		return out
	}
	mux.HandleFunc("GET "+p+"/users/{id}/role-mappings/realm", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		_ = json.NewEncoder(w).Encode(reps(f.roles[r.PathValue("id")]))
	})
	mux.HandleFunc("GET "+p+"/users/{id}/role-mappings/realm/available", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		var free []string
		for _, n := range all {
			if !slices.Contains(f.roles[r.PathValue("id")], n) {
				free = append(free, n)
			}
		}
		_ = json.NewEncoder(w).Encode(reps(free))
	})
	mux.HandleFunc(p+"/users/{id}/role-mappings/realm", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		var rs []kcRole
		_ = json.NewDecoder(r.Body).Decode(&rs)
		id := r.PathValue("id")
		for _, x := range rs {
			if r.Method == http.MethodPost {
				f.roles[id] = append(f.roles[id], x.Name)
			} else {
				f.roles[id] = slices.DeleteFunc(f.roles[id], func(n string) bool { return n == x.Name })
			}
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET "+p+"/roles/{role}/users", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		out := []map[string]any{}
		for id, rs := range f.roles {
			if slices.Contains(rs, r.PathValue("role")) {
				out = append(out, f.users[id])
			}
		}
		_ = json.NewEncoder(w).Encode(out)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return NewKeycloak(srv.URL, "alanfelez", "api-admin", "s3cret"), f
}

func TestStaffAccounts(t *testing.T) {
	k, f := newFakeRealm(t)
	ctx := context.Background()

	id, err := k.CreateStaff(ctx, "sales.ali", "Ali", "Rezaei", "a-long-password", true, []string{"sales"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := k.CreateStaff(ctx, "sales.ali", "Ali", "", "a-long-password", false, []string{"sales"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("same username: %v", err)
	}
	if _, err := k.CreateStaff(ctx, "x.y", "X", "", "abc", false, []string{"sales"}); !errors.Is(err, ErrBadPassword) {
		t.Fatalf("short password: %v", err)
	}
	f.otp[id] = true

	staff, err := k.ListStaff(ctx)
	if err != nil || len(staff) != 1 || staff[0].Username != "sales.ali" || !slices.Equal(staff[0].Roles, []string{"sales"}) || !staff[0].TOTP || !staff[0].Enabled {
		t.Fatalf("list: %+v %v", staff, err)
	}

	// Roles change to exactly the new set; a non-staff role the user holds is left alone.
	f.roles[id] = append(f.roles[id], "default-roles-alanfelez")
	if err := k.SetStaffRoles(ctx, id, []string{"editor", "support"}); err != nil {
		t.Fatal(err)
	}
	if got := f.roles[id]; !slices.Contains(got, "editor") || !slices.Contains(got, "support") || slices.Contains(got, "sales") || !slices.Contains(got, "default-roles-alanfelez") {
		t.Fatalf("roles: %v", got)
	}

	if err := k.UpdateStaff(ctx, id, "Ali", "R.", false); err != nil {
		t.Fatal(err)
	}
	if u := f.users[id]; u["enabled"] != false || u["lastName"] != "R." || u["username"] != "sales.ali" {
		t.Fatalf("update kept the rest? %v", u)
	}
	if name, err := k.DisplayName(ctx, id); err != nil || name != "Ali R." {
		t.Fatalf("name: %q %v", name, err)
	}
	if err := k.SetPassword(ctx, id, "abc", false); !errors.Is(err, ErrBadPassword) {
		t.Fatalf("weak password: %v", err)
	}
	if err := k.SetPassword(ctx, id, "another-long-one", true); err != nil {
		t.Fatal(err)
	}
}
