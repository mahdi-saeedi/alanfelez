package visits

import (
	"net/url"
	"regexp"
	"strings"
	"time"
)

// How long user activity is kept (privacy page; client 2026-11-03): each page view 1 year, the daily summary 2 years.
const (
	PageViewRetention = 365 * 24 * time.Hour
	ActivityRetention = 730 * 24 * time.Hour
)

// MaxReportSeconds caps one "time in view" report: a tab left open in the background isn't time spent reading.
const MaxReportSeconds = 1800

// Sections of the website, as the admin shows them. A path outside these is "other".
var Sections = []string{"home", "prices", "chart", "auctions", "analysis", "calculator", "plans", "account", "faq", "about", "contact", "search", "other"}

var sectionOf = map[string]string{
	"": "home", "prices": "prices", "chart": "chart", "auctions": "auctions", "analysis": "analysis", "calculator": "calculator",
	"plans": "plans", "checkout": "plans", "account": "account", "faq": "faq", "about": "about", "contact": "contact", "search": "search",
}

var slugRe = regexp.MustCompile(`^[a-z0-9-]{1,80}$`)

// Page is what a website path says about a page: its section and, if any, the metal, price row or article it is
// about. The slugs are only shaped like slugs here; the API checks them against the catalog.
type Page struct {
	Section string
	Metal   string // /prices/<metal> or ?metal=
	Series  string // ?series= (chart, calculator) or the first compared chart (?c1=…)
	Article string // /analysis/<slug>
}

// ParsePage reads a path with its query string, as the website sends it (/en/prices/copper, /chart?series=…).
func ParsePage(raw string) Page {
	u, err := url.Parse(raw)
	if err != nil {
		return Page{Section: "other"}
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if parts[0] == "en" || parts[0] == "fa" {
		parts = parts[1:]
	}
	first := ""
	if len(parts) > 0 {
		first = parts[0]
	}
	p := Page{Section: "other"}
	if s, ok := sectionOf[first]; ok {
		p.Section = s
	}
	q := u.Query()
	slug := func(s string) string {
		if slugRe.MatchString(s) {
			return s
		}
		return ""
	}
	switch {
	case p.Section == "prices" && len(parts) > 1:
		p.Metal = slug(parts[1])
	case p.Section == "analysis" && len(parts) > 1:
		p.Article = slug(parts[1])
	}
	if p.Metal == "" {
		p.Metal = slug(q.Get("metal"))
	}
	p.Series = slug(q.Get("series"))
	if p.Series == "" && p.Section == "chart" {
		for _, k := range []string{"c1", "c2", "c3", "c4"} {
			if s := slug(q.Get(k)); s != "" {
				p.Series = s
				break
			}
		}
	}
	return p
}

// Bounds is the start and end (exclusive) of a Tehran calendar day given as Day returns it (midnight UTC of the date).
func Bounds(day time.Time) (start, end time.Time) {
	y, m, d := day.Date()
	start = time.Date(y, m, d, 0, 0, 0, 0, tehran)
	return start.UTC(), start.AddDate(0, 0, 1).UTC()
}
