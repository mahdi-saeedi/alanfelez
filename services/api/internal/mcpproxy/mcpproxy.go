// Package mcpproxy forwards https://api.alanfelez.ir/mcp to ArvanCloud's MCP server (https://mcp.arvancloud.ir), so
// a claude.ai custom connector can use it (ADR-0031). Connectors can't send Arvan's "Arvancloud-Api-Key" header,
// so the caller sends its own ArvanCloud API key in a header the connector does support and this proxy renames it:
//
//	api-key: <key>  or  x-api-key: <key>  or  Authorization: Bearer <key>   →   Arvancloud-Api-Key: <key>
//
// The proxy stores no key of its own: a request without one is answered 401 here and never reaches Arvan, and a
// wrong key is refused by Arvan. Keys are never logged (the request log has only method, path and status).
package mcpproxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// Prefix is the path the proxy is mounted at; it is removed before forwarding (/mcp → /, /mcp/x → /x).
const Prefix = "/mcp"

// DefaultToolsets is sent as X-Mcp-Toolsets when the caller doesn't choose (owner, 2026-11-07: all tools).
const DefaultToolsets = "all"

// New returns the proxy handler for upstream (e.g. https://mcp.arvancloud.ir).
func New(upstream string) (http.Handler, error) {
	target, err := url.Parse(strings.TrimSuffix(upstream, "/"))
	if err != nil {
		return nil, err //nolint:wrapcheck // url.Parse errors already name the input
	}
	rp := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target) // joins target's path with the incoming one; Host becomes the upstream's
			pr.Out.URL.Path = target.Path + strings.TrimPrefix(pr.In.URL.Path, Prefix)
			pr.Out.URL.RawPath = ""
			h := pr.Out.Header
			// Nothing of ours goes upstream: the caller's credentials headers and cookies, our forwarding headers.
			for _, name := range []string{"Api-Key", "X-Api-Key", "Authorization", "Cookie", "Forwarded",
				"X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Real-Ip"} {
				h.Del(name)
			}
			h.Set("Arvancloud-Api-Key", callerKey(pr.In.Header))
			if h.Get("X-Mcp-Toolsets") == "" {
				h.Set("X-Mcp-Toolsets", DefaultToolsets)
			}
		},
		FlushInterval: -1, // MCP answers can be server-sent event streams: pass every byte on at once
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			ResponseHeaderTimeout: 60 * time.Second,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if callerKey(r.Header) == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"send your ArvanCloud API key in the api-key header"}`))
			return
		}
		rp.ServeHTTP(w, r)
	}), nil
}

// callerKey returns the ArvanCloud key the caller sent, or "".
func callerKey(h http.Header) string {
	for _, name := range []string{"Api-Key", "X-Api-Key"} {
		if v := strings.TrimSpace(h.Get(name)); v != "" {
			return v
		}
	}
	if v, ok := strings.CutPrefix(h.Get("Authorization"), "Bearer "); ok {
		return strings.TrimSpace(v)
	}
	return ""
}
