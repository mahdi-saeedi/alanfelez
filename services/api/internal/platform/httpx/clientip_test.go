package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientInfo(t *testing.T) {
	trusted, err := ParsePrefixes([]string{"127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "::1/128", "fc00::/7"}) // config default
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, remote string
		xff          []string
		want         string
	}{
		{"direct client", "203.0.113.7:5000", nil, "203.0.113.7"},
		{"direct client can't spoof", "203.0.113.7:5000", []string{"1.2.3.4"}, "203.0.113.7"},
		{"behind ingress", "10.42.0.9:5000", []string{"198.51.100.2"}, "198.51.100.2"},
		{"ingress → web → api", "10.42.0.12:5000", []string{"1.2.3.4, 198.51.100.2, 10.42.0.9"}, "198.51.100.2"},
		{"only proxies", "10.42.0.12:5000", []string{"10.42.0.9"}, "10.42.0.9"},
		{"malformed chain", "10.42.0.12:5000", []string{"nope"}, "10.42.0.12"},
		{"ipv6 loopback", "[::1]:5000", []string{"2001:db8::1"}, "2001:db8::1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var got Client
			h := ClientInfo(trusted)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { got = ClientFrom(r.Context()) }))
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
			req.RemoteAddr = c.remote
			req.Header.Set("User-Agent", "test")
			for _, v := range c.xff {
				req.Header.Add("X-Forwarded-For", v)
			}
			h.ServeHTTP(httptest.NewRecorder(), req)
			if got.IP == nil || got.IP.String() != c.want || got.UserAgent != "test" {
				t.Fatalf("got %v %q, want %s", got.IP, got.UserAgent, c.want)
			}
		})
	}
}
