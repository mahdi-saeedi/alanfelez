package visits

import (
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Where visitors come from and on what (admin «تحلیل بازدید», client 2026-11-05). Only the referring site's name or a
// campaign tag is kept, never the full link; nothing here identifies a person.

var sources = []struct {
	re   *regexp.Regexp
	name string
}{
	{regexp.MustCompile(`(^|\.)google\.`), "google"},
	{regexp.MustCompile(`(^|\.)bing\.com$`), "bing"},
	{regexp.MustCompile(`(^|\.)yandex\.`), "yandex"},
	{regexp.MustCompile(`(^|\.)(instagram\.com|l\.instagram\.com)$`), "instagram"},
	{regexp.MustCompile(`(^|\.)(t\.me|telegram\.org|telegram\.me)$`), "telegram"},
	{regexp.MustCompile(`(^|\.)(whatsapp\.com|wa\.me)$`), "whatsapp"},
	{regexp.MustCompile(`(^|\.)eitaa\.com$`), "eitaa"},
	{regexp.MustCompile(`(^|\.)(ble\.ir|bale\.ai)$`), "bale"},
	{regexp.MustCompile(`(^|\.)(linkedin\.com|lnkd\.in)$`), "linkedin"},
	{regexp.MustCompile(`(^|\.)(twitter\.com|x\.com|t\.co)$`), "x"},
	{regexp.MustCompile(`(^|\.)(facebook\.com|fb\.com)$`), "facebook"},
	{regexp.MustCompile(`(^|\.)aparat\.com$`), "aparat"},
}

var tagRe = regexp.MustCompile(`[^a-z0-9._-]+`)

// Tag cleans a campaign tag (utm_source / utm_campaign): lowercase latin, digits and . _ -, at most 40.
func Tag(s string) string {
	t := strings.Trim(tagRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "-"), "-")
	if len(t) > 40 {
		t = t[:40]
	}
	return t
}

// Source names where a visit came from: a campaign tag (utm_source) wins, then a known site, then the referring
// site's own name ("ref:example.com"), else "direct". ownHost (the site itself) counts as direct.
func Source(referrer, utmSource, ownHost string) string {
	if t := Tag(utmSource); t != "" {
		return "utm:" + t
	}
	if referrer == "" {
		return "direct"
	}
	u, err := url.Parse(referrer)
	if err != nil || u.Hostname() == "" {
		return "direct"
	}
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	if host == strings.TrimPrefix(strings.ToLower(ownHost), "www.") || strings.HasSuffix(host, ".alanfelez.ir") || host == "alanfelez.ir" || host == "alanfelez.com" {
		return "direct"
	}
	for _, s := range sources {
		if s.re.MatchString(host) {
			return s.name
		}
	}
	if len(host) > 60 {
		host = host[:60]
	}
	return "ref:" + host
}

var mobileRe = regexp.MustCompile(`(?i)mobile|iphone|ipod|android|opera mini|iemobile`)

// Device is mobile, tablet or desktop, from the user agent.
func Device(userAgent string) string {
	switch {
	case strings.Contains(strings.ToLower(userAgent), "ipad") || strings.Contains(strings.ToLower(userAgent), "tablet"):
		return "tablet"
	case mobileRe.MatchString(userAgent):
		return "mobile"
	}
	return "desktop"
}

var spaceRe = regexp.MustCompile(`\s+`)

// SearchTerm normalises what someone typed in the site search: trimmed, one space between words, Arabic ي/ك as
// Persian ی/ک, lowercase latin, at most 60 characters. Empty = not worth counting.
func SearchTerm(q string) string {
	q = strings.NewReplacer("ي", "ی", "ك", "ک", "\u200c", " ").Replace(q)
	q = strings.ToLower(strings.TrimSpace(spaceRe.ReplaceAllString(q, " ")))
	for utf8.RuneCountInString(q) > 60 {
		_, size := utf8.DecodeLastRuneInString(q)
		q = q[:len(q)-size]
	}
	if utf8.RuneCountInString(q) < 2 {
		return ""
	}
	return q
}
