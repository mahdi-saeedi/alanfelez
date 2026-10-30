package httpx

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// MaxBodyBytes caps every request body (the largest legitimate ones are rich-text pages and 500-row price uploads).
// The generated server doesn't enforce the OpenAPI maxLength/maxItems, so this is the backstop.
const MaxBodyBytes = 2 << 20

// MaxUploadBytes is the cap for file uploads (PUT …/pdf: an auction's PDF notice of at most 10 MB, plus room;
// PUT …/image: a member's chart image of at most 5 MB).
const MaxUploadBytes = 11 << 20

// requestSize caps request bodies: MaxUploadBytes for the upload routes, MaxBodyBytes for everything else.
func requestSize(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := int64(MaxBodyBytes)
		if r.Method == http.MethodPut && (strings.HasSuffix(r.URL.Path, "/pdf") || strings.HasSuffix(r.URL.Path, "/image")) {
			limit = MaxUploadBytes
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

// Pinger is anything whose availability gates readiness (database, Redis).
type Pinger interface {
	Ping(ctx context.Context) error
}

// NewRouter builds the base router with standard middleware and health endpoints.
//
//	/healthz  liveness: the process is up (never checks dependencies) → 204
//	/readyz   readiness: every dependency answers → 200 {"status":"ready"}; otherwise 503 (problem JSON).
//	          Kubernetes stops routing traffic to a pod that isn't ready; Argo Rollouts' canary analysis reads it too.
//
// extra middleware runs after the standard ones (e.g. ClientInfo).
func NewRouter(log *slog.Logger, corsOrigins []string, deps map[string]Pinger, extra ...func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	// Client IPs: middleware.RealIP is intentionally NOT used (it trusts spoofable headers); see ClientInfo.
	r.Use(requestLogger(log))
	r.Use(recoverer(log))
	r.Use(requestSize)
	r.Use(securityHeaders)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "Accept-Language", "Idempotency-Key", "If-Match"},
		ExposedHeaders:   []string{"ETag", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"},
		AllowCredentials: false, // the API uses bearer tokens, never cookies (SECURITY.md T9)
		MaxAge:           600,
	}))
	r.Use(extra...)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		for name, dep := range deps {
			if err := dep.Ping(ctx); err != nil {
				log.WarnContext(ctx, "readiness check failed", "dependency", name, "err", err)
				WriteProblem(w, req, http.StatusServiceUnavailable, "NOT_READY", "Dependency unavailable", name)
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		WriteProblem(w, req, http.StatusNotFound, CodeNotFound, "Not found", "")
	})
	return r
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
				return // probes would drown the logs
			}
			log.InfoContext(r.Context(), "http request",
				"method", r.Method, "path", r.URL.Path, "status", ww.Status(),
				"bytes", ww.BytesWritten(), "duration_ms", time.Since(start).Milliseconds(),
				"request_id", middleware.GetReqID(r.Context()))
		})
	}
}

func recoverer(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					if err, ok := rec.(error); ok && errors.Is(err, http.ErrAbortHandler) {
						panic(rec)
					}
					log.ErrorContext(r.Context(), "panic", "panic", rec, "path", r.URL.Path,
						"request_id", middleware.GetReqID(r.Context()))
					WriteProblem(w, r, http.StatusInternalServerError, CodeInternal, "Internal error", "")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
