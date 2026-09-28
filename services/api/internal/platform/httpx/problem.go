// Package httpx holds HTTP plumbing shared by every handler: router, middleware,
// RFC 9457 problem responses and health endpoints.
package httpx

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
)

// Problem codes (stable, machine-readable; catalog in docs/architecture/API_GUIDELINES.md §4).
const (
	CodeValidationFailed = "VALIDATION_FAILED"
	CodeNotFound         = "NOT_FOUND"
	CodeInternal         = "INTERNAL"
)

const problemBase = "https://alanfelez.ir/problems/"

// Problem is an RFC 9457 problem details body.
type Problem struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Status    int    `json:"status"`
	Code      string `json:"code"`
	Detail    string `json:"detail,omitempty"`
	RequestID string `json:"requestId,omitempty"`
}

// WriteProblem writes a problem response. detail must never contain secrets or PII.
func WriteProblem(w http.ResponseWriter, r *http.Request, status int, code, title, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Problem{
		Type:      problemBase + code,
		Title:     title,
		Status:    status,
		Code:      code,
		Detail:    detail,
		RequestID: middleware.GetReqID(r.Context()),
	})
}

// RequestErrorHandler handles errors raised while decoding a request (bad params/body).
func RequestErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	WriteProblem(w, r, http.StatusBadRequest, CodeValidationFailed, "Invalid request", err.Error())
}

// ResponseErrorHandler handles unexpected handler errors: log with context, answer generically.
func ResponseErrorHandler(log *slog.Logger) func(http.ResponseWriter, *http.Request, error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		log.ErrorContext(r.Context(), "request failed", "err", err, "path", r.URL.Path,
			"request_id", middleware.GetReqID(r.Context()))
		WriteProblem(w, r, http.StatusInternalServerError, CodeInternal, "Internal error", "")
	}
}
