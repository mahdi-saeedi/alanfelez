package visits

import (
	"testing"
	"time"
)

func TestDay(t *testing.T) {
	// 21:00 UTC is already the next day in Tehran (UTC+03:30).
	got := Day(time.Date(2026, 10, 26, 21, 0, 0, 0, time.UTC))
	if want := time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC); !got.Equal(want) {
		t.Fatalf("Day = %v, want %v", got, want)
	}
	if got := Day(time.Date(2026, 10, 26, 20, 0, 0, 0, time.UTC)); got.Day() != 26 {
		t.Fatalf("23:30 Tehran is still the 26th: %v", got)
	}
}

func TestIsRobot(t *testing.T) {
	for ua, want := range map[string]bool{
		"": true,
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)": true,
		"TelegramBot (like TwitterBot)":                                            true,
		"curl/8.4.0":                                                               true,
		"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36":                                false,
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1": false,
	} {
		if got := IsRobot(ua); got != want {
			t.Errorf("IsRobot(%q) = %v, want %v", ua, got, want)
		}
	}
}

func TestAnonID(t *testing.T) {
	s1, s2 := [16]byte{1}, [16]byte{2}
	a := AnonID(s1, "5.6.7.8", "Firefox")
	if a != AnonID(s1, "5.6.7.8", "Firefox") || len(a) != 34 || a[:2] != "a:" {
		t.Fatalf("not stable or wrong shape: %q", a)
	}
	if a == AnonID(s2, "5.6.7.8", "Firefox") || a == AnonID(s1, "5.6.7.9", "Firefox") || a == AnonID(s1, "5.6.7.8", "Chrome") {
		t.Fatal("different salt, IP or browser must give a different id")
	}
}
