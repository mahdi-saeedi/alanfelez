// Package jalali converts Gregorian dates to the Persian (Jalali/Solar Hijri) calendar for server-rendered text
// (SMS). The web apps use Intl (fa-IR-u-ca-persian); this is the same calendar for Go.
package jalali

import (
	"fmt"
	"strings"
	"time"
)

// Months are the Persian month names.
var Months = [12]string{"فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"}

// FromGregorian converts a Gregorian date to Jalali (year, month 1–12, day).
// Algorithm: the standard day-count conversion (valid for the Gregorian years we care about, 1900–2100+).
func FromGregorian(gy, gm, gd int) (jy, jm, jd int) {
	gdm := [12]int{0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334}
	gy2 := gy
	if gm > 2 {
		gy2 = gy + 1
	}
	days := 355666 + 365*gy + (gy2+3)/4 - (gy2+99)/100 + (gy2+399)/400 + gd + gdm[gm-1]
	jy = -1595 + 33*(days/12053)
	days %= 12053
	jy += 4 * (days / 1461)
	days %= 1461
	if days > 365 {
		jy += (days - 1) / 365
		days = (days - 1) % 365
	}
	if days < 186 {
		jm = 1 + days/31
		jd = 1 + days%31
	} else {
		jm = 7 + (days-186)/30
		jd = 1 + (days-186)%30
	}
	return jy, jm, jd
}

var tehran = func() *time.Location {
	if l, err := time.LoadLocation("Asia/Tehran"); err == nil {
		return l
	}
	return time.FixedZone("IRST", 3*3600+1800)
}()

// Format renders t as a Tehran-date in Persian, e.g. "۶ آبان ۱۴۰۵".
func Format(t time.Time) string {
	l := t.In(tehran)
	y, m, d := FromGregorian(l.Year(), int(l.Month()), l.Day())
	return Digits(fmt.Sprintf("%d %s %d", d, Months[m-1], y))
}

// Digits converts ASCII digits to Persian digits.
func Digits(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return '۰' + (r - '0')
		}
		return r
	}, s)
}

// Latin converts Persian and Arabic-Indic digits to ASCII digits (for input typed on a Persian keyboard).
func Latin(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= '۰' && r <= '۹':
			return '0' + (r - '۰')
		case r >= '٠' && r <= '٩':
			return '0' + (r - '٠')
		}
		return r
	}, s)
}
