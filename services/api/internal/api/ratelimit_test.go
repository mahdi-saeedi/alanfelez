package api

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
)

// countLimiter allows `max` hits per scope/id and records the keys it saw.
type countLimiter struct {
	max  int
	hits map[string]int
}

func (l *countLimiter) Allow(_ context.Context, scope, id string, _ int, _ time.Duration) (bool, error) {
	l.hits[scope+":"+id]++
	return l.hits[scope+":"+id] <= l.max, nil
}

func TestRateLimit(t *testing.T) {
	trusted, _ := httpx.ParsePrefixes([]string{"10.0.0.0/8", "127.0.0.0/8"})
	lim := &countLimiter{max: 2, hits: map[string]int{}}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	h := httpx.ClientInfo(trusted)(RateLimit(lim, trusted, slog.New(slog.NewTextHandler(io.Discard, nil)))(ok))

	call := func(remote string, p *auth.Principal) int {
		req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/v1/prices", nil)
		req.RemoteAddr = remote
		if p != nil {
			req = req.WithContext(auth.WithPrincipal(req.Context(), p))
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	user := &auth.Principal{ID: pgtype.UUID{Bytes: [16]byte{1}, Valid: true}}
	staff := &auth.Principal{ID: pgtype.UUID{Bytes: [16]byte{2}, Valid: true}, Roles: []string{auth.RoleStaff}}

	for i, want := range []int{204, 204, 429} {
		if got := call("203.0.113.5:1000", nil); got != want {
			t.Fatalf("anonymous call %d: %d, want %d", i+1, got, want)
		}
	}
	for range 5 {
		if got := call("10.1.2.3:1000", nil); got != 204 {
			t.Fatalf("the website server (internal, anonymous) must not be limited: %d", got)
		}
	}
	for i, want := range []int{204, 204, 429} {
		if got := call("10.1.2.3:1000", user); got != want { // same pod, but keyed on the user
			t.Fatalf("user call %d: %d, want %d", i+1, got, want)
		}
	}
	for range 5 {
		if got := call("203.0.113.9:1000", staff); got != 204 {
			t.Fatalf("staff must not be limited: %d", got)
		}
	}
	if len(lim.hits) != 2 {
		t.Fatalf("keys = %v", lim.hits)
	}
}
