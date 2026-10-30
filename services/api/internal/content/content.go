// Package content holds the CMS rules shared by the API handlers: which feature unlocks an article type,
// how rich text is sanitized, and how input is validated (SCOPE §5, §10; ADR-0025).
//
// Rich text arrives as HTML from the admin editor. It is sanitized here on every write and stored sanitized,
// so the website can render it as-is. Seed files are trusted code and are written as the same safe subset.
package content

import (
	"html"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/microcosm-cc/bluemonday"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
)

// Type is an article type. It decides who may read the body.
type Type string

// Article types.
const (
	News     Type = "news"
	Analysis Type = "analysis"
	Forecast Type = "forecast"
)

// Feature is the entitlement needed to read the body of an article of type t. Titles, summaries and covers are
// public teasers; the body of a locked article is never sent.
func (t Type) Feature() (access.Feature, bool) {
	switch t {
	case News:
		return access.NewsRead, true
	case Analysis:
		return access.AnalysisRead, true
	case Forecast:
		return access.ForecastRead, true
	}
	return "", false
}

var slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ValidSlug reports whether s is a URL slug: lowercase ASCII words joined by hyphens, at most 120 characters.
func ValidSlug(s string) bool { return len(s) <= 120 && slugRe.MatchString(s) }

// policy is the HTML subset the editor produces and the site renders. No scripts, styles, event handlers,
// iframes or forms; links get rel="noreferrer"; external ones also get nofollow and open in a new tab.
var policy = func() *bluemonday.Policy {
	p := bluemonday.NewPolicy()
	p.AllowElements("p", "br", "hr", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "sub", "sup",
		"blockquote", "ul", "ol", "li", "code", "pre", "table", "thead", "tbody", "tr", "th", "td", "figure", "figcaption")
	p.AllowAttrs("href").OnElements("a")
	p.AllowStandardURLs() // http, https, mailto and relative URLs
	p.RequireNoFollowOnLinks(false)
	p.RequireNoFollowOnFullyQualifiedLinks(true) // internal links keep their SEO value
	p.RequireParseableURLs(true)
	p.RequireNoReferrerOnLinks(true)
	p.AddTargetBlankToFullyQualifiedLinks(true)
	p.AllowAttrs("src", "alt").OnElements("img")
	p.AllowAttrs("width", "height").Matching(regexp.MustCompile(`^\d{1,4}$`)).OnElements("img")
	p.AllowAttrs("colspan", "rowspan").Matching(regexp.MustCompile(`^\d{1,2}$`)).OnElements("td", "th")
	p.AllowAttrs("dir").Matching(regexp.MustCompile(`^(rtl|ltr|auto)$`)).Globally()
	p.AllowAttrs("start").Matching(regexp.MustCompile(`^\d{1,4}$`)).OnElements("ol")
	return p
}()

var strict = bluemonday.StrictPolicy()

// Sanitize returns the safe subset of rich-text HTML s.
func Sanitize(s string) string { return strings.TrimSpace(policy.Sanitize(s)) }

// PlainText strips all markup from s and collapses whitespace (for summaries, search and word counts).
func PlainText(s string) string {
	return strings.Join(strings.Fields(html.UnescapeString(strict.Sanitize(s))), " ")
}

// MaxKeywords is how many keywords an article shows under a locked title.
const MaxKeywords = 6

// Keywords splits what an editor typed ("مس، کمبود عرضه, شیلی") into at most MaxKeywords plain-text words or phrases,
// in order, without blanks or repeats. Persian and Latin commas, semicolons and new lines all separate.
func Keywords(s string) []string {
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == '،' || r == ';' || r == '؛' || r == '\n' })
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = PlainText(p); p != "" && !slices.Contains(out, p) && len(out) < MaxKeywords {
			out = append(out, p)
		}
	}
	return out
}

// ReadMinutes estimates reading time for body HTML at 200 words a minute (at least 1).
func ReadMinutes(body string) int {
	words := len(strings.Fields(PlainText(body)))
	return max(1, (words+199)/200)
}

// Clean trims s and reports whether its length is within [minLen, maxLen] characters.
func Clean(s string, minLen, maxLen int) (string, bool) {
	s = strings.TrimSpace(s)
	n := utf8.RuneCountInString(s)
	return s, n >= minLen && n <= maxLen
}
