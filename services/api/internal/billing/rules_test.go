package billing

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
)

var now = time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)

func days(n int) time.Duration { return time.Duration(n) * 24 * time.Hour }

func TestQuoteFor(t *testing.T) {
	silverPrice, goldPrice := int64(10_000_000), int64(20_000_000)
	cases := []struct {
		name       string
		held       []Held
		plan       access.Tier
		price      int64
		wantKind   Kind
		wantStarts time.Time
		wantCredit int64
		replaces   []string
	}{
		{
			name: "nothing held: new, starts now", plan: access.Silver, price: silverPrice,
			wantKind: KindNew, wantStarts: now,
		},
		{
			name: "expired plans are ignored",
			held: []Held{{ID: "old", Plan: access.Gold, Starts: now.Add(-days(40)), Ends: now.Add(-days(10)), PaidRial: goldPrice}},
			plan: access.Silver, price: silverPrice, wantKind: KindNew, wantStarts: now,
		},
		{
			name: "renewal queues after the current plan",
			held: []Held{{ID: "s", Plan: access.Silver, Starts: now.Add(-days(10)), Ends: now.Add(days(20)), PaidRial: silverPrice}},
			plan: access.Silver, price: silverPrice, wantKind: KindRenewal, wantStarts: now.Add(days(20)),
		},
		{
			name: "renewal queues after an already queued renewal",
			held: []Held{
				{ID: "s1", Plan: access.Silver, Starts: now.Add(-days(10)), Ends: now.Add(days(20)), PaidRial: silverPrice},
				{ID: "s2", Plan: access.Silver, Starts: now.Add(days(20)), Ends: now.Add(days(50)), PaidRial: silverPrice},
			},
			plan: access.Silver, price: silverPrice, wantKind: KindRenewal, wantStarts: now.Add(days(50)),
		},
		{
			name: "downgrade starts when the higher plan ends",
			held: []Held{{ID: "g", Plan: access.Gold, Starts: now.Add(-days(5)), Ends: now.Add(days(25)), PaidRial: goldPrice}},
			plan: access.Silver, price: silverPrice, wantKind: KindDowngrade, wantStarts: now.Add(days(25)),
		},
		{
			// 10 of 30 days used: 20/30 of 10,000,000 = 6,666,666 credit.
			name: "upgrade starts now with the unused paid value credited",
			held: []Held{{ID: "s", Plan: access.Silver, Starts: now.Add(-days(10)), Ends: now.Add(days(20)), PaidRial: silverPrice}},
			plan: access.Gold, price: goldPrice, wantKind: KindUpgrade, wantStarts: now, wantCredit: 6_666_666, replaces: []string{"s"},
		},
		{
			name: "upgrade credits a queued lower plan in full",
			held: []Held{
				{ID: "s1", Plan: access.Silver, Starts: now.Add(-days(15)), Ends: now.Add(days(15)), PaidRial: silverPrice},
				{ID: "s2", Plan: access.Silver, Starts: now.Add(days(15)), Ends: now.Add(days(45)), PaidRial: silverPrice},
			},
			plan: access.Gold, price: goldPrice, wantKind: KindUpgrade, wantStarts: now, wantCredit: 5_000_000 + 10_000_000, replaces: []string{"s1", "s2"},
		},
		{
			name: "manual grants give no credit",
			held: []Held{{ID: "m", Plan: access.Silver, Starts: now.Add(-days(1)), Ends: now.Add(days(29))}},
			plan: access.Gold, price: goldPrice, wantKind: KindUpgrade, wantStarts: now, replaces: []string{"m"},
		},
		{
			name: "credit is capped at the price",
			held: []Held{
				{ID: "y", Plan: access.Silver, Starts: now, Ends: now.Add(days(365)), PaidRial: 96_000_000},
			},
			plan: access.Gold, price: goldPrice, wantKind: KindUpgrade, wantStarts: now, wantCredit: goldPrice, replaces: []string{"y"},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			q, err := QuoteFor(now, c.held, c.plan, Month, c.price)
			if err != nil {
				t.Fatal(err)
			}
			if q.Kind != c.wantKind || !q.Starts.Equal(c.wantStarts) || q.Credit != c.wantCredit {
				t.Fatalf("got kind=%s starts=%v credit=%d, want %s %v %d", q.Kind, q.Starts, q.Credit, c.wantKind, c.wantStarts, c.wantCredit)
			}
			if q.Amount != c.price-c.wantCredit || q.Price != c.price {
				t.Fatalf("amount=%d price=%d", q.Amount, q.Price)
			}
			if !q.Ends.Equal(q.Starts.Add(days(30))) {
				t.Fatalf("ends = %v, want 30 days after %v", q.Ends, q.Starts)
			}
			if !slices.Equal(q.Replaces, c.replaces) {
				t.Fatalf("replaces = %v, want %v", q.Replaces, c.replaces)
			}
		})
	}
}

func TestQuoteForErrors(t *testing.T) {
	if _, err := QuoteFor(now, nil, access.Free, Month, 0); !errors.Is(err, ErrFreePlan) {
		t.Fatalf("free plan: %v", err)
	}
	if _, err := QuoteFor(now, nil, access.Gold, Period("week"), 1); !errors.Is(err, ErrUnknownPeriod) {
		t.Fatalf("unknown period: %v", err)
	}
}

func TestPeriods(t *testing.T) {
	for p, want := range map[Period]int{Month: 30, Quarter: 90, Year: 365} {
		if d, ok := p.Days(); !ok || d != want {
			t.Errorf("%s = %d", p, d)
		}
	}
}

func TestRefundEligible(t *testing.T) {
	paid := now.Add(-days(3))
	if !RefundEligible(now, paid, false) {
		t.Error("3 days after payment, unused: eligible")
	}
	if RefundEligible(now, paid, true) {
		t.Error("used: never eligible")
	}
	if RefundEligible(now, now.Add(-days(8)), false) {
		t.Error("8 days after payment: not eligible")
	}
	if !RefundEligible(now, now.Add(-RefundWindow), false) {
		t.Error("exactly 7 days: still eligible")
	}
}
