package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alanfelez/alanfelez/services/api/internal/auth"
)

func TestSiteOnly(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	h := SiteOnly("api.alanfelez.ir")(ok)
	cases := []struct {
		name, host, path string
		roles            []string
		want             int
	}{
		{"outsider on the public host", "api.alanfelez.ir", "/v1/prices", nil, 403},
		{"outsider with a port", "API.alanfelez.ir:443", "/v1/series/copper-lme/points", nil, 403},
		{"member token on the public host", "api.alanfelez.ir", "/v1/prices", []string{"user"}, 403},
		{"staff (admin panel)", "api.alanfelez.ir", "/v1/admin/catalog", []string{"staff", "editor"}, 204},
		{"the website, inside the cluster", "alanfelez-api:8080", "/v1/prices", nil, 204},
		{"outside /v1 (mock payment page, health)", "api.alanfelez.ir", "/mock-gateway", nil, 204},
	}
	for _, c := range cases {
		r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, c.path, nil)
		r.Host = c.host
		if c.roles != nil {
			r = r.WithContext(auth.WithPrincipal(context.Background(), &auth.Principal{Roles: c.roles}))
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != c.want {
			t.Errorf("%s: %d, want %d", c.name, w.Code, c.want)
		}
	}
	// Off when no host is configured (local development).
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/v1/prices", nil)
	w := httptest.NewRecorder()
	SiteOnly("")(ok).ServeHTTP(w, r)
	if w.Code != 204 {
		t.Errorf("off: %d", w.Code)
	}
}
