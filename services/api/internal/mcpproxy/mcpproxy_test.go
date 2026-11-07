package mcpproxy_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alanfelez/alanfelez/services/api/internal/mcpproxy"
)

// upstream records the last request it got and answers with a two-event stream.
func upstream(t *testing.T) (*httptest.Server, *http.Request) {
	t.Helper()
	got := &http.Request{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*got = *r.Clone(r.Context())
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Mcp-Session-Id", "s1")
		_, _ = io.WriteString(w, "data: one\n\n")
		w.(http.Flusher).Flush()
		_, _ = io.WriteString(w, "data: two\n\n")
	}))
	t.Cleanup(srv.Close)
	return srv, got
}

func call(t *testing.T, h http.Handler, path string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, path, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRenamesTheKeyHeader(t *testing.T) {
	for name, headers := range map[string]map[string]string{
		"api-key":       {"api-key": "k1"},
		"x-api-key":     {"x-api-key": "k1"},
		"bearer":        {"Authorization": "Bearer k1"},
		"api-key wins":  {"api-key": "k1", "Authorization": "Bearer other"},
		"spaces around": {"api-key": "  k1 "},
	} {
		t.Run(name, func(t *testing.T) {
			srv, got := upstream(t)
			h, err := mcpproxy.New(srv.URL)
			if err != nil {
				t.Fatal(err)
			}
			headers["Cookie"] = "session=secret"
			headers["Mcp-Session-Id"] = "s1"
			rec := call(t, h, "/mcp", headers)
			if rec.Code != http.StatusOK {
				t.Fatalf("status %d: %s", rec.Code, rec.Body)
			}
			if v := got.Header.Get("Arvancloud-Api-Key"); v != "k1" {
				t.Errorf("Arvancloud-Api-Key = %q, want k1", v)
			}
			for _, h := range []string{"Api-Key", "X-Api-Key", "Authorization", "Cookie", "X-Forwarded-For"} {
				if v := got.Header.Get(h); v != "" {
					t.Errorf("%s was forwarded: %q", h, v)
				}
			}
			if got.Header.Get("Mcp-Session-Id") != "s1" || got.Header.Get("X-Mcp-Toolsets") != "all" {
				t.Errorf("session/toolsets headers: %v", got.Header)
			}
			if got.URL.Path != "/" || got.Method != http.MethodPost {
				t.Errorf("forwarded %s %q, want POST /", got.Method, got.URL.Path)
			}
			if body := rec.Body.String(); body != "data: one\n\ndata: two\n\n" || rec.Header().Get("Mcp-Session-Id") != "s1" {
				t.Errorf("response: %q %v", body, rec.Header())
			}
		})
	}
}

func TestSubPathsAndToolsetChoice(t *testing.T) {
	srv, got := upstream(t)
	h, err := mcpproxy.New(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	call(t, h, "/mcp/.well-known/x", map[string]string{"api-key": "k", "X-Mcp-Toolsets": "iaas"})
	if got.URL.Path != "/.well-known/x" || got.Header.Get("X-Mcp-Toolsets") != "iaas" {
		t.Errorf("forwarded %q toolsets %q", got.URL.Path, got.Header.Get("X-Mcp-Toolsets"))
	}
}

func TestNoKeyNeverReachesArvan(t *testing.T) {
	srv, got := upstream(t)
	h, err := mcpproxy.New(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	for _, headers := range []map[string]string{nil, {"api-key": "  "}, {"Authorization": "Basic abc"}} {
		if rec := call(t, h, "/mcp", headers); rec.Code != http.StatusUnauthorized {
			t.Errorf("%v: status %d, want 401", headers, rec.Code)
		}
	}
	if got.URL != nil {
		t.Error("a request without a key was forwarded")
	}
}
