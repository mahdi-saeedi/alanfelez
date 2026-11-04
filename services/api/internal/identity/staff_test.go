package identity

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
)

// fakeRealm is just enough of Keycloak's Admin API for staff accounts: users, realm roles and their mappings.
type fakeRealm struct {
	mu        sync.Mutex
	users     map[string]map[string]any // id → representation
	roles     map[string][]string       // user id → direct realm roles
	passwords map[string]string
}

func (f *fakeRealm) server(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /realms/alanfelez/protocol/openid-connect/token", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":300}`))
	})
	base := "/admin/realms/alanfelez"
	mux.HandleFunc("POST "+base+"/users", func(w http.ResponseWriter, r *http.Request) {
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
		id := fmt.Sprintf("u%d", len(f.users)+1)
		f.users[id] = u
		creds := u["credentials"].([]any)[0].(map[string]any)
		if creds["temporary"] != true {
			t.Error("password not temporary")
		}
		f.passwords[id] = creds["value"].(string)
		w.Header().Set("Location", "http://kc"+base+"/users/"+id)
		w.WriteHeader(http.StatusCreated)
	})
	mux.HandleFunc("GET "+base+"/roles/{name}", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"id-` + r.PathValue("name") + `","name":"` + r.PathValue("name") + `"}`))
	})
	mux.HandleFunc("GET "+base+"/roles/{name}/users", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		var out []map[string]any
		for id, rs := range f.roles {
			if slices.Contains(rs, r.PathValue("name")) || (r.PathValue("name") == "staff" && len(rs) > 0) {
				u := map[string]any{"id": id, "username": f.users[id]["username"], "enabled": true}
				out = append(out, u)
			}
		}
		_ = json.NewEncoder(w).Encode(out)
	})
	mux.HandleFunc("GET "+base+"/users/{id}/credentials", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`[{"type":"password"}]`))
	})
	mapping := base + "/users/{id}/role-mappings/realm"
	mux.HandleFunc("GET "+mapping, func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		var out []map[string]string
		for _, n := range f.roles[r.PathValue("id")] {
			out = append(out, map[string]string{"id": "id-" + n, "name": n})
		}
		_ = json.NewEncoder(w).Encode(out)
	})
	change := func(add bool) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			f.mu.Lock()
			defer f.mu.Unlock()
			b, _ := io.ReadAll(r.Body)
			var reps []map[string]string
			_ = json.Unmarshal(b, &reps)
			id := r.PathValue("id")
			for _, rep := range reps {
				if add {
					f.roles[id] = append(f.roles[id], rep["name"])
				} else {
					f.roles[id] = slices.DeleteFunc(f.roles[id], func(n string) bool { return n == rep["name"] })
				}
			}
			w.WriteHeader(http.StatusNoContent)
		}
	}
	mux.HandleFunc("POST "+mapping, change(true))
	mux.HandleFunc("DELETE "+mapping, change(false))
	mux.HandleFunc("PUT "+base+"/users/{id}/reset-password", func(w http.ResponseWriter, r *http.Request) {
		var c map[string]any
		_ = json.NewDecoder(r.Body).Decode(&c)
		f.mu.Lock()
		f.passwords[r.PathValue("id")] = c["value"].(string)
		f.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestStaffAccountsKeycloak(t *testing.T) {
	f := &fakeRealm{users: map[string]map[string]any{}, roles: map[string][]string{}, passwords: map[string]string{}}
	k := NewKeycloak(f.server(t).URL, "alanfelez", "api-admin", "s3cret")
	ctx := t.Context()
	id, err := k.CreateStaff(ctx, NewStaff{Username: "sales.ali", FirstName: "علی", LastName: "فروش", Role: "staff", Password: "Temp-12345!"})
	if err != nil || id != "u1" || f.passwords["u1"] != "Temp-12345!" || !slices.Equal(f.roles["u1"], []string{"staff"}) {
		t.Fatalf("create: %q %v %v", id, err, f.roles)
	}
	if req := f.users["u1"]["requiredActions"].([]any); len(req) != 2 {
		t.Fatalf("required actions: %v", req)
	}
	if _, err := k.CreateStaff(ctx, NewStaff{Username: "sales.ali", Role: "staff", Password: "x"}); !errors.Is(err, ErrUsernameTaken) {
		t.Fatalf("taken: %v", err)
	}
	if err := k.SetStaffRole(ctx, "u1", "editor"); err != nil || !slices.Equal(f.roles["u1"], []string{"editor"}) {
		t.Fatalf("role: %v %v", err, f.roles)
	}
	if err := k.SetStaffRole(ctx, "u1", "owner"); err == nil || !strings.Contains(err.Error(), "unknown") {
		t.Fatalf("unknown role: %v", err)
	}
	if err := k.ResetPassword(ctx, "u1", "Another-123!"); err != nil || f.passwords["u1"] != "Another-123!" {
		t.Fatalf("reset: %v", err)
	}
	list, err := k.ListStaff(ctx)
	if err != nil || len(list) != 1 || list[0].Role != "editor" || list[0].TOTP {
		t.Fatalf("list: %+v %v", list, err)
	}
}
