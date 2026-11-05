package visits

import (
	"testing"
	"time"
)

func TestParsePage(t *testing.T) {
	cases := []struct {
		in   string
		want Page
	}{
		{"/", Page{Section: "home"}},
		{"/en", Page{Section: "home"}},
		{"/prices", Page{Section: "prices"}},
		{"/prices?metal=copper", Page{Section: "prices", Metal: "copper"}},
		{"/en/prices/aluminum", Page{Section: "prices", Metal: "aluminum"}},
		{"/chart?series=copper-cathode-bazaar", Page{Section: "chart", Series: "copper-cathode-bazaar"}},
		{"/chart?metal=zinc&c1=&c2=zinc-ingot", Page{Section: "chart", Metal: "zinc", Series: "zinc-ingot"}},
		{"/auctions?metal=lead&page=2", Page{Section: "auctions", Metal: "lead"}},
		{"/analysis/copper-week-2", Page{Section: "analysis", Article: "copper-week-2"}},
		{"/checkout?plan=gold", Page{Section: "checkout"}},
		{"/terms", Page{Section: "other"}},
		{"/prices?metal=DROP%20TABLE", Page{Section: "prices"}},
		{"%zz", Page{Section: "other"}},
	}
	for _, c := range cases {
		if got := ParsePage(c.in); got != c.want {
			t.Errorf("ParsePage(%q) = %+v, want %+v", c.in, got, c.want)
		}
	}
}

func TestBounds(t *testing.T) {
	day := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	start, end := Bounds(day)
	if want := time.Date(2026, 11, 2, 20, 30, 0, 0, time.UTC); !start.Equal(want) {
		t.Errorf("start = %v, want %v", start, want)
	}
	if end.Sub(start) != 24*time.Hour {
		t.Errorf("end − start = %v", end.Sub(start))
	}
	if got := Day(start); !got.Equal(day) {
		t.Errorf("Day(start) = %v, want %v", got, day)
	}
}
