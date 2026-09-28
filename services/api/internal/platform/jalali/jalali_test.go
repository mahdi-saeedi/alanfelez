package jalali

import (
	"testing"
	"time"
)

func TestFromGregorian(t *testing.T) {
	cases := []struct{ gy, gm, gd, jy, jm, jd int }{
		{2024, 3, 20, 1403, 1, 1},   // Nowruz 1403
		{2024, 8, 23, 1403, 6, 2},   // matches the web formatter test (۲ شهریور ۱۴۰۳)
		{2026, 9, 28, 1405, 7, 6},   // ۶ مهر ۱۴۰۵
		{2026, 10, 28, 1405, 8, 6},  // ۶ آبان ۱۴۰۵ (the M2 test grant's end)
		{2025, 3, 20, 1403, 12, 30}, // 1403 is a leap year: 30 Esfand exists
		{2025, 3, 21, 1404, 1, 1},
		{2000, 1, 1, 1378, 10, 11},
	}
	for _, c := range cases {
		jy, jm, jd := FromGregorian(c.gy, c.gm, c.gd)
		if jy != c.jy || jm != c.jm || jd != c.jd {
			t.Errorf("%d-%02d-%02d → %d/%d/%d, want %d/%d/%d", c.gy, c.gm, c.gd, jy, jm, jd, c.jy, c.jm, c.jd)
		}
	}
}

func TestFormatUsesTehranDate(t *testing.T) {
	// 21:00 UTC on 28 Oct is already 29 Oct in Tehran (+03:30).
	if got := Format(time.Date(2026, 10, 28, 21, 0, 0, 0, time.UTC)); got != "۷ آبان ۱۴۰۵" {
		t.Fatalf("Format = %q", got)
	}
}
