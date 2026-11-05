package visits

import "testing"

func TestSource(t *testing.T) {
	for _, c := range []struct{ ref, utm, want string }{
		{"", "", "direct"},
		{"https://www.google.com/", "", "google"},
		{"https://www.google.co.uk/search?q=x", "", "google"},
		{"https://l.instagram.com/?u=x", "", "instagram"},
		{"https://t.me/alanfelez", "", "telegram"},
		{"https://staging.alanfelez.ir/prices", "", "direct"},
		{"https://example.com/a/b", "", "ref:example.com"},
		{"https://www.google.com/", "Insta Aban!", "utm:insta-aban"},
		{"not a url", "", "direct"},
	} {
		if got := Source(c.ref, c.utm, "alanfelez.ir"); got != c.want {
			t.Errorf("Source(%q, %q) = %q, want %q", c.ref, c.utm, got, c.want)
		}
	}
}

func TestDevice(t *testing.T) {
	for ua, want := range map[string]string{
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148":      "mobile",
		"Mozilla/5.0 (Linux; Android 14; SM-S918B) Chrome/120 Mobile Safari/537.36": "mobile",
		"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)":                             "tablet",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36":        "desktop",
	} {
		if got := Device(ua); got != want {
			t.Errorf("Device(%q) = %q, want %q", ua, got, want)
		}
	}
}

func TestSearchTerm(t *testing.T) {
	for in, want := range map[string]string{
		"  قيمت   مس  ": "قیمت مس",
		"Copper":        "copper",
		"a":             "",
		"شمش\u200cها":   "شمش ها",
	} {
		if got := SearchTerm(in); got != want {
			t.Errorf("SearchTerm(%q) = %q, want %q", in, got, want)
		}
	}
}
