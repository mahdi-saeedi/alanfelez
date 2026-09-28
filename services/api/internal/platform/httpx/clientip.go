package httpx

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// Client is who sent the request, for rate limits and abuse logs.
type Client struct {
	IP        *netip.Addr // nil when unknown
	UserAgent string
}

type clientKey struct{}

// ClientFrom returns the client recorded by ClientInfo.
func ClientFrom(ctx context.Context) Client {
	c, _ := ctx.Value(clientKey{}).(Client)
	return c
}

// ClientInfo records the client IP and user agent. X-Forwarded-For is only believed when the direct peer is a
// trusted proxy, and then the right-most address that isn't a trusted proxy wins, so a client can't spoof its
// IP by sending the header itself (SECURITY §5). The website server forwards the header it received.
func ClientInfo(trusted []netip.Prefix) func(http.Handler) http.Handler {
	isTrusted := func(a netip.Addr) bool {
		for _, p := range trusted {
			if p.Contains(a) {
				return true
			}
		}
		return false
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c := Client{UserAgent: r.UserAgent()}
			if ip, ok := peerIP(r.RemoteAddr); ok {
				if isTrusted(ip) {
					ip = fromForwarded(r.Header.Values("X-Forwarded-For"), ip, isTrusted)
				}
				c.IP = &ip
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), clientKey{}, c)))
		})
	}
}

// ParsePrefixes parses CIDRs (config values); invalid entries are reported.
func ParsePrefixes(cidrs []string) ([]netip.Prefix, error) {
	out := make([]netip.Prefix, 0, len(cidrs))
	for _, s := range cidrs {
		p, err := netip.ParsePrefix(strings.TrimSpace(s))
		if err != nil {
			return nil, fmt.Errorf("parse %q: %w", s, err)
		}
		out = append(out, p)
	}
	return out, nil
}

func peerIP(remote string) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		host = remote
	}
	a, err := netip.ParseAddr(host)
	return a.Unmap(), err == nil
}

func fromForwarded(values []string, peer netip.Addr, trusted func(netip.Addr) bool) netip.Addr {
	var hops []string
	for _, v := range values {
		hops = append(hops, strings.Split(v, ",")...)
	}
	for i := len(hops) - 1; i >= 0; i-- {
		a, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			return peer // a malformed chain: don't guess
		}
		a = a.Unmap()
		if !trusted(a) {
			return a
		}
		peer = a
	}
	return peer
}
