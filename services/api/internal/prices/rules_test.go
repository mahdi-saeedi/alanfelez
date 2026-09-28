package prices

import (
	"testing"
	"time"
)

func ptr(v int64) *int64 { return &v }

func TestJumpBp(t *testing.T) {
	cases := []struct{ prev, next, want int64 }{
		{100, 100, 0},
		{100, 115, 1500},
		{100, 85, 1500},
		{3, 4, 3333}, // truncated
		{64_000_000, 64_064_000, 10},
	}
	for _, c := range cases {
		if got := JumpBp(c.prev, c.next); got != c.want {
			t.Errorf("JumpBp(%d, %d) = %d, want %d", c.prev, c.next, got, c.want)
		}
	}
}

func TestChangeFrom(t *testing.T) {
	if _, ok := ChangeFrom(nil, 10); ok {
		t.Fatal("no previous close must mean no change")
	}
	if _, ok := ChangeFrom(ptr(0), 10); ok {
		t.Fatal("zero previous close must mean no change")
	}
	c, ok := ChangeFrom(ptr(2_000_000), 2_025_000)
	if !ok || c.Amount != 25_000 || c.Bp != 125 {
		t.Fatalf("got %+v %v, want +25000 / 125 bp", c, ok)
	}
	c, _ = ChangeFrom(ptr(2_000_000), 1_990_000)
	if c.Amount != -10_000 || c.Bp != -50 {
		t.Fatalf("got %+v, want -10000 / -50 bp", c)
	}
}

func TestNextLatest(t *testing.T) {
	// 2026-09-28 10:00 Tehran = 06:30 UTC. Tehran midnight = 20:30 UTC the day before.
	morning := time.Date(2026, 9, 28, 6, 30, 0, 0, time.UTC)
	cur := &Latest{Price: 100, ObservedAt: morning, PrevClose: ptr(90)}

	if ok, pc := NextLatest(nil, morning); !ok || pc != nil {
		t.Errorf("first point: got %v %v, want replace without previous close", ok, pc)
	}
	if ok, _ := NextLatest(cur, morning.Add(-time.Minute)); ok {
		t.Error("an older point must not replace the latest")
	}
	if ok, pc := NextLatest(cur, morning.Add(time.Hour)); !ok || pc == nil || *pc != 90 {
		t.Errorf("same day: got %v %v, want replace keeping previous close 90", ok, pc)
	}
	// 23:59 Tehran is still the same day (20:29 UTC).
	if ok, pc := NextLatest(cur, time.Date(2026, 9, 28, 20, 29, 0, 0, time.UTC)); !ok || *pc != 90 {
		t.Errorf("23:59 Tehran: got %v %v, want same day", ok, pc)
	}
	// 00:01 Tehran next day (20:31 UTC): the old latest becomes the previous close.
	if ok, pc := NextLatest(cur, time.Date(2026, 9, 28, 20, 31, 0, 0, time.UTC)); !ok || pc == nil || *pc != 100 {
		t.Errorf("next Tehran day: got %v %v, want previous close 100", ok, pc)
	}
}

func TestRangeAllowedBy(t *testing.T) {
	cases := []struct {
		r     Range
		limit int
		want  bool
	}{
		{Range1D, 30, true}, {Range1W, 30, true}, {Range1M, 30, true},
		{Range3M, 30, false}, {RangeMax, 30, false},
		{Range3Y, 0, true}, {RangeMax, 0, true},
		{Range("2D"), 30, false}, {Range("2D"), 0, true}, // unknown ranges are rejected by Window, not here
	}
	for _, c := range cases {
		if got := c.r.AllowedBy(c.limit); got != c.want {
			t.Errorf("%s.AllowedBy(%d) = %v, want %v", c.r, c.limit, got, c.want)
		}
	}
}

func TestWindow(t *testing.T) {
	now := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	first := now.AddDate(-2, 0, 0)
	cases := []struct {
		r          Range
		wantSince  time.Time
		wantBucket int
	}{
		{Range1D, now.AddDate(0, 0, -1), 300},         // 86400/300 = 288 points
		{Range1W, now.AddDate(0, 0, -7), 3600},        // 168 points
		{Range1M, now.AddDate(0, 0, -30), 4 * 3600},   // 180 points
		{Range1Y, now.AddDate(0, 0, -365), 2 * 86400}, // 182 points (daily would be 365)
		{RangeMax, first, 3 * 86400},                  // 2 years → 243 points
	}
	for _, c := range cases {
		since, bucket, err := Window(c.r, now, first)
		if err != nil {
			t.Fatal(err)
		}
		if !since.Equal(c.wantSince) {
			t.Errorf("%s since = %v, want %v", c.r, since, c.wantSince)
		}
		if bucket != c.wantBucket {
			t.Errorf("%s bucket = %d, want %d", c.r, bucket, c.wantBucket)
		}
	}
	if _, _, err := Window(Range("2D"), now, first); err == nil {
		t.Error("unknown range must fail")
	}
}
