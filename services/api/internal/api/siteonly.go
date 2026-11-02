package api

import (
	"net"
	"net/http"
	"strings"

	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
)

// SiteOnly keeps the public API address for Alan Felez itself (client, 2026-11-02: "nobody may connect their site to
// mine and take my prices automatically"). The website calls the API inside the cluster (another host name) and the
// admin panel signs in as staff, so on publicHost every /v1 call without a staff token is refused. Pages outside /v1
// (health checks, the mock payment page) stay as they are. An empty publicHost turns it off (local development).
func SiteOnly(publicHost string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if publicHost == "" {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/v1/") && strings.EqualFold(hostOnly(r.Host), publicHost) {
				if p := auth.FromContext(r.Context()); p == nil || !p.HasRole(auth.RoleStaff) {
					httpx.WriteProblem(w, r, http.StatusForbidden, codeForbidden, "Not available", "this API serves the Alan Felez website and admin only")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// hostOnly drops the port from a Host header.
func hostOnly(h string) string {
	if host, _, err := net.SplitHostPort(h); err == nil {
		return host
	}
	return h
}
