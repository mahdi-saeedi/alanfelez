package content

import (
	"net/url"
	"regexp"
	"strings"
)

var aparatHash = regexp.MustCompile(`^[A-Za-z0-9]{3,40}$`)

// AparatVideo reads an Aparat video link as staff paste it (the page link aparat.com/v/HASH, with or without www,
// http or a query, or the embed link …/embed/videohash/HASH/…) and returns the canonical page link
// https://www.aparat.com/v/HASH. ok is false for anything else, so no other site can be embedded (client, 2026-11-04).
func AparatVideo(s string) (canonical string, ok bool) {
	s = strings.TrimSpace(s)
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return "", false
	}
	if host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www."); host != "aparat.com" {
		return "", false
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	hash := ""
	switch {
	case len(parts) >= 2 && parts[0] == "v":
		hash = parts[1]
	default:
		for i, p := range parts {
			if p == "videohash" && i+1 < len(parts) {
				hash = parts[i+1]
			}
		}
	}
	if !aparatHash.MatchString(hash) {
		return "", false
	}
	return "https://www.aparat.com/v/" + hash, true
}
