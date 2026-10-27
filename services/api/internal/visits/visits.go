// Package visits counts daily visitors without cookies (admin «آمار بازدید», client 2026-10-27): an anonymous
// visitor is a one-way id of the day's salt, IP and user agent; robots aren't counted.
package visits

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"time"
)

// Retention is how long daily visit rows are kept (privacy page §5).
const Retention = 90 * 24 * time.Hour

var tehran = time.FixedZone("IRST", 3*3600+1800) // Iran has no daylight saving time since 2022

// Day is the Tehran calendar day of t, as midnight UTC of that date (what a Postgres date column holds).
func Day(t time.Time) time.Time {
	y, m, d := t.In(tehran).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// robots match search engines, link previews, monitors and scripts. An empty user agent is a script too.
var robots = regexp.MustCompile(`(?i)bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|monitor|uptime|headless|lighthouse|curl|wget|python|go-http|java/|okhttp|axios|node-fetch|httpclient|scrapy`)

// IsRobot reports whether a request with this user agent shouldn't be counted.
func IsRobot(userAgent string) bool {
	return userAgent == "" || robots.MatchString(userAgent)
}

// AnonID is the anonymous visitor id for one day: it can't be turned back into the IP, and once the day's salt is
// deleted it can't be linked to the same person on another day.
func AnonID(salt [16]byte, ip, userAgent string) string {
	h := sha256.New()
	h.Write(salt[:])
	h.Write([]byte(ip))
	h.Write([]byte{0})
	h.Write([]byte(userAgent))
	return "a:" + hex.EncodeToString(h.Sum(nil)[:16])
}
