package api

import (
	"log/slog"
	"net/http"
	"net/netip"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/ratelimit"
)

// Request budgets per minute (SECURITY §5, T2: deter scraping paid data with one account). A person browsing
// makes a handful of API calls per page, far below these. Staff are not limited (bulk admin work).
const (
	perUserPerMinute = 300
	perIPPerMinute   = 120
)

// RateLimit limits API calls per signed-in user, or per client IP for anonymous callers. Anonymous calls from
// trusted proxies without a forwarded client (the website server rendering pages for many visitors) are exempt:
// the website is limited by its own capacity, and its visitors by the CDN. It fails open when Redis is down.
func RateLimit(l ratelimit.Limiter, trusted []netip.Prefix, log *slog.Logger) func(http.Handler) http.Handler {
	internal := func(ip *netip.Addr) bool {
		if ip == nil {
			return true
		}
		for _, p := range trusted {
			if p.Contains(*ip) {
				return true
			}
		}
		return false
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			scope, id, limit := "", "", 0
			if p := auth.FromContext(r.Context()); p != nil {
				if p.HasRole(auth.RoleStaff) {
					next.ServeHTTP(w, r)
					return
				}
				scope, id, limit = "api-user", uuid.UUID(p.ID.Bytes).String(), perUserPerMinute
			} else {
				ip := httpx.ClientFrom(r.Context()).IP
				if internal(ip) {
					next.ServeHTTP(w, r)
					return
				}
				scope, id, limit = "api-ip", ip.String(), perIPPerMinute
			}
			ok, err := l.Allow(r.Context(), scope, id, limit, time.Minute)
			if err != nil {
				log.WarnContext(r.Context(), "rate limit unavailable", "err", err)
			}
			w.Header().Set("RateLimit-Limit", strconv.Itoa(limit))
			if !ok {
				w.Header().Set("Retry-After", strconv.Itoa(60-time.Now().Second()))
				httpx.WriteProblem(w, r, http.StatusTooManyRequests, codeRateLimited, "Too many requests", "slow down and retry later")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
