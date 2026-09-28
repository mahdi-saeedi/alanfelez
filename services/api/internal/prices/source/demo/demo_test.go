package demo

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/prices"
	"github.com/alanfelez/alanfelez/services/api/internal/prices/source"
)

func newDemo(t *testing.T, latest map[string]int64) *Source {
	t.Helper()
	raw, _ := json.Marshal(Config{StepBp: 25, BackfillDays: 30, Seed: 42, Series: map[string]int64{"a": 6_400_000, "b": 345_000}})
	f, err := New(raw, source.Deps{Latest: func(context.Context) (map[string]int64, error) { return latest, nil }})
	if err != nil {
		t.Fatal(err)
	}
	return f.(*Source)
}

func TestFetchStaysUnderTheOutlierGate(t *testing.T) {
	s := newDemo(t, map[string]int64{"a": 6_000_000})
	now := time.Date(2026, 9, 28, 8, 0, 0, 0, time.UTC)
	for range 1000 {
		qs, err := s.Fetch(t.Context(), now)
		if err != nil {
			t.Fatal(err)
		}
		if len(qs) != 2 {
			t.Fatalf("got %d quotes, want 2", len(qs))
		}
		for _, q := range qs {
			prev := int64(6_000_000)
			if q.Series == "b" {
				prev = 345_000 // no latest: starts from base
			}
			// 3 steps of 25 bp + 3 % mean reversion must stay far below the 15 % gate.
			if j := prices.JumpBp(prev, q.Price); j > 1500 {
				t.Fatalf("%s moved %d bp", q.Series, j)
			}
			if !q.ObservedAt.Equal(now) {
				t.Fatalf("observedAt = %v", q.ObservedAt)
			}
		}
	}
}

func TestBackfillIsOrderedAndContinuous(t *testing.T) {
	s := newDemo(t, nil)
	now := time.Date(2026, 9, 28, 8, 0, 0, 0, time.UTC)
	qs, err := s.Backfill(t.Context(), now)
	if err != nil {
		t.Fatal(err)
	}
	perSeries := map[string][]prices.Quote{}
	for _, q := range qs {
		perSeries[q.Series] = append(perSeries[q.Series], q)
	}
	for slug, list := range perSeries {
		// 24 daily points (days 30..7) + ~166 hourly points.
		if len(list) < 150 || len(list) > 200 {
			t.Errorf("%s: %d points", slug, len(list))
		}
		for i := 1; i < len(list); i++ {
			if !list[i].ObservedAt.After(list[i-1].ObservedAt) {
				t.Fatalf("%s: not strictly increasing at %d", slug, i)
			}
			if j := prices.JumpBp(list[i-1].Price, list[i].Price); j > 1500 {
				t.Fatalf("%s: jump of %d bp at %d would be quarantined", slug, j, i)
			}
		}
		if last := list[len(list)-1].ObservedAt; !last.Before(now) {
			t.Errorf("%s: last point %v is not in the past", slug, last)
		}
	}
}

func TestRoundNice(t *testing.T) {
	cases := map[int64]int64{9_999: 9_999, 6_411_873: 6_412_000, 345_049: 345_000, 12_345: 12_350}
	for in, want := range cases {
		if got := roundNice(in); got != want {
			t.Errorf("roundNice(%d) = %d, want %d", in, got, want)
		}
	}
}

func TestConfigErrors(t *testing.T) {
	if _, err := New(json.RawMessage(`{"series":{}}`), source.Deps{}); err == nil {
		t.Error("empty series must fail")
	}
	if _, err := New(json.RawMessage(`not json`), source.Deps{}); err == nil {
		t.Error("bad json must fail")
	}
}
