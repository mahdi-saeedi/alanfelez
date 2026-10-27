package alerts

import (
	"testing"
	"time"
)

func TestQuiet(t *testing.T) {
	tehran := func(h, m int) time.Time {
		return time.Date(2026, 10, 27, h, m, 0, 0, time.FixedZone("IRST", 3*3600+1800))
	}
	for _, c := range []struct {
		t    time.Time
		want bool
	}{{tehran(7, 59), true}, {tehran(8, 0), false}, {tehran(14, 0), false}, {tehran(21, 59), false}, {tehran(22, 0), true}, {tehran(2, 0), true}} {
		if got := Quiet(c.t); got != c.want {
			t.Errorf("Quiet(%v) = %v", c.t, got)
		}
	}
}

func TestBatchReady(t *testing.T) {
	last := time.Date(2026, 10, 27, 10, 0, 0, 0, time.UTC)
	if BatchReady(last, last.Add(14*time.Minute)) || !BatchReady(last, last.Add(15*time.Minute)) {
		t.Fatal("a batch goes out 15 minutes after the last change")
	}
}
