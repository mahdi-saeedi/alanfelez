package billing

import (
	"testing"
	"time"
)

func TestStageAndDaysLeft(t *testing.T) {
	h := time.Hour
	for _, c := range []struct {
		left        time.Duration
		stage, days int
	}{
		{7 * 24 * h, 7, 7}, {6*24*h + 1, 7, 7}, {6 * 24 * h, 7, 6}, {3*24*h + h, 7, 4},
		{3 * 24 * h, 3, 3}, {60 * h, 3, 3}, {25 * h, 3, 2}, {24 * h, 1, 1}, {2 * h, 1, 1},
	} {
		if s, d := Stage(c.left), DaysLeft(c.left); s != c.stage || d != c.days {
			t.Errorf("left %v: stage %d days %d, want %d %d", c.left, s, d, c.stage, c.days)
		}
	}
}
