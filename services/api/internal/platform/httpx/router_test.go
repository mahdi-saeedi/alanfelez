package httpx

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakePinger struct{ err error }

func (f fakePinger) Ping(context.Context) error { return f.err }

func TestProbes(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	cases := []struct {
		name       string
		deps       map[string]Pinger
		path       string
		wantStatus int
		wantBody   string
	}{
		{"liveness ignores dependencies", map[string]Pinger{"db": fakePinger{errors.New("down")}}, "/healthz", http.StatusNoContent, ""},
		{"ready when all deps answer", map[string]Pinger{"db": fakePinger{}}, "/readyz", http.StatusOK, `{"status":"ready"}`},
		{"not ready when a dep fails", map[string]Pinger{"db": fakePinger{errors.New("down")}}, "/readyz", http.StatusServiceUnavailable, `"code":"NOT_READY"`},
		{"unknown route is a problem", nil, "/nope", http.StatusNotFound, `"code":"NOT_FOUND"`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			NewRouter(log, nil, c.deps).ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, c.path, nil))
			if rec.Code != c.wantStatus {
				t.Fatalf("status %d, want %d", rec.Code, c.wantStatus)
			}
			if !strings.Contains(rec.Body.String(), c.wantBody) {
				t.Errorf("body %q does not contain %q", rec.Body.String(), c.wantBody)
			}
		})
	}
}
