package api

import (
	"log/slog"
	"net/http"
	"net/netip"

	"github.com/go-chi/chi/v5"

	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
	"github.com/alanfelez/alanfelez/services/api/internal/prices/live"
)

// Mount registers every API route on r behind token validation: the generated handlers plus the
// hand-written SSE stream. main and the integration tests share it, so tests exercise the real wiring.
//
// The API rate limit sits after authentication (it keys on the user); it uses the server's limiter, so tests and
// environments without Redis (ratelimit.None) aren't limited.
func Mount(r chi.Router, s *Server, v auth.Verifier, hub *live.Hub, log *slog.Logger, trusted []netip.Prefix) {
	strict := NewStrictHandlerWithOptions(s, nil, StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  httpx.RequestErrorHandler,
		ResponseErrorHandlerFunc: httpx.ResponseErrorHandler(log),
	})
	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(v, func(w http.ResponseWriter, req *http.Request, err error) {
			log.InfoContext(req.Context(), "token rejected", "err", err)
			httpx.WriteProblem(w, req, http.StatusUnauthorized, codeUnauthenticated, "Invalid or expired token", "")
		}))
		r.Get("/v1/prices/stream", hub.Handler(
			func(req *http.Request) (bool, error) { return s.SeesAllSeries(req.Context()) },
			s.Snapshot,
			httpx.ResponseErrorHandler(log),
		))
		// The long-lived stream above is not rate limited (one per tab); everything else is.
		r.Group(func(r chi.Router) {
			r.Use(RateLimit(s.limiter, trusted, log))
			HandlerWithOptions(strict, ChiServerOptions{BaseRouter: r, ErrorHandlerFunc: httpx.RequestErrorHandler})
		})
	})
}
