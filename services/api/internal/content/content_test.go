package content

import (
	"strings"
	"testing"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
)

func TestSanitize(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"keeps the editor subset", `<h2>عنوان</h2><p><strong>مس</strong> و <em>روی</em></p><ul><li>یک</li></ul>`,
			`<h2>عنوان</h2><p><strong>مس</strong> و <em>روی</em></p><ul><li>یک</li></ul>`},
		{"drops scripts", `<p>hi</p><script>alert(1)</script>`, `<p>hi</p>`},
		{"drops event handlers", `<p onclick="x()">hi</p>`, `<p>hi</p>`},
		{"drops javascript links", `<a href="javascript:alert(1)">x</a>`, `x`},
		{"relative link", `<a href="/prices">x</a>`, `<a href="/prices" rel="noreferrer">x</a>`},
		{"external link opens in a new tab", `<a href="https://lme.com">x</a>`,
			`<a href="https://lme.com" rel="nofollow noreferrer noopener" target="_blank">x</a>`},
		{"h1 becomes text", `<h1>big</h1>`, `big`},
		{"styles and iframes go", `<p style="color:red">a</p><iframe src="https://x"></iframe>`, `<p>a</p>`},
		{"dir is kept when valid", `<p dir="ltr">LME</p><p dir="evil">x</p>`, `<p dir="ltr">LME</p><p>x</p>`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Sanitize(c.in); got != c.want {
				t.Fatalf("Sanitize(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestPlainTextAndReadMinutes(t *testing.T) {
	if got := PlainText("<p>قیمت&nbsp;مس</p>\n<p>  امروز </p>"); got != "قیمت مس امروز" {
		t.Fatalf("PlainText = %q", got)
	}
	if got := ReadMinutes("<p>کوتاه</p>"); got != 1 {
		t.Fatalf("short text = %d minutes, want 1", got)
	}
	long := "<p>" + strings.Repeat("کلمه ", 401) + "</p>"
	if got := ReadMinutes(long); got != 3 {
		t.Fatalf("401 words = %d minutes, want 3", got)
	}
}

func TestTypeFeature(t *testing.T) {
	for typ, want := range map[Type]access.Feature{News: access.NewsRead, Analysis: access.AnalysisRead, Forecast: access.ForecastRead} {
		if f, ok := typ.Feature(); !ok || f != want {
			t.Errorf("%s → %s", typ, f)
		}
	}
	if _, ok := Type("ad").Feature(); ok {
		t.Error("unknown type must not map to a feature")
	}
	// The matrix (SCOPE §6): news is free, analysis and forecasts are Gold.
	if access.Allowed(access.Free, access.NewsRead) || !access.Allowed(access.Silver, access.NewsRead) || access.Allowed(access.Silver, access.AnalysisRead) || !access.Allowed(access.Gold, access.ForecastRead) {
		t.Error("article features don't match the tier matrix")
	}
}

func TestValidSlugAndClean(t *testing.T) {
	for s, want := range map[string]bool{"copper-price-up": true, "a": true, "Copper": false, "a--b": false, "-a": false, "مس": false, "": false} {
		if ValidSlug(s) != want {
			t.Errorf("ValidSlug(%q) != %v", s, want)
		}
	}
	if s, ok := Clean("  سلام  ", 2, 10); !ok || s != "سلام" {
		t.Errorf("Clean = %q %v", s, ok)
	}
	if _, ok := Clean("ا", 2, 10); ok {
		t.Error("too short must fail")
	}
}
