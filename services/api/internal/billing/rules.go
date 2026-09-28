// Package billing owns orders, payments, subscriptions and refunds (SCOPE §6, SECURITY §7).
//
// rules.go holds the pure rules (no I/O): what a purchase costs and when it starts, given what the user
// already holds. They're table-tested in rules_test.go.
package billing

import (
	"errors"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
)

// Period is a billing period. Lengths are fixed days (🛠 SCOPE §6), which keeps proration exact.
type Period string

// Billing periods.
const (
	Month   Period = "month"
	Quarter Period = "quarter"
	Year    Period = "year"
)

var periodDays = map[Period]int{Month: 30, Quarter: 90, Year: 365}

// Days returns the length of p in days.
func (p Period) Days() (int, bool) {
	d, ok := periodDays[p]
	return d, ok
}

// Kind of purchase, relative to what the user holds.
type Kind string

// Purchase kinds.
const (
	KindNew       Kind = "new"       // nothing paid held: starts now
	KindRenewal   Kind = "renewal"   // same plan held: starts when it ends
	KindUpgrade   Kind = "upgrade"   // only lower plans held: starts now, their unused paid value is credited
	KindDowngrade Kind = "downgrade" // a higher plan held: starts when it ends
)

// Held is an active subscription of the user (ends in the future).
type Held struct {
	ID       string
	Plan     access.Tier
	Starts   time.Time
	Ends     time.Time
	PaidRial int64 // what the user paid for it; 0 for manual grants (no credit)
}

// Quote is what a purchase costs and when it runs.
type Quote struct {
	Kind     Kind
	Starts   time.Time
	Ends     time.Time
	Price    int64    // plan price for the period
	Credit   int64    // credit applied (≤ Price)
	Amount   int64    // Price − Credit: what the gateway charges
	Replaces []string // subscriptions ended early by an upgrade
}

// Errors.
var (
	ErrFreePlan      = errors.New("the free plan can't be bought")
	ErrUnknownPeriod = errors.New("unknown billing period")
)

// QuoteFor prices buying plan for period at price (Rial), given the user's active subscriptions.
func QuoteFor(now time.Time, held []Held, plan access.Tier, period Period, price int64) (Quote, error) {
	if !plan.Valid() || plan == access.Free {
		return Quote{}, ErrFreePlan
	}
	days, ok := period.Days()
	if !ok {
		return Quote{}, ErrUnknownPeriod
	}
	q := Quote{Kind: KindNew, Starts: now, Price: price}

	var sameOrHigher, lower []Held
	for _, h := range held {
		if !h.Ends.After(now) {
			continue
		}
		if h.Plan.AtLeast(plan) {
			sameOrHigher = append(sameOrHigher, h)
		} else {
			lower = append(lower, h)
		}
	}

	switch {
	case len(sameOrHigher) > 0:
		// Queue after everything at this rank or above, so paid time is never lost.
		q.Kind = KindDowngrade
		for _, h := range sameOrHigher {
			if h.Plan == plan {
				q.Kind = KindRenewal
			}
			if h.Ends.After(q.Starts) {
				q.Starts = h.Ends
			}
		}
	case len(lower) > 0:
		q.Kind = KindUpgrade
		for _, h := range lower {
			q.Credit += unusedValue(now, h)
			q.Replaces = append(q.Replaces, h.ID)
		}
	}
	if q.Credit > price {
		q.Credit = price
	}
	q.Amount = price - q.Credit
	q.Ends = q.Starts.AddDate(0, 0, days)
	return q, nil
}

// unusedValue is the paid value of the part of h after now (the whole value if h hasn't started yet).
func unusedValue(now time.Time, h Held) int64 {
	if h.PaidRial <= 0 {
		return 0
	}
	total := h.Ends.Sub(h.Starts)
	if total <= 0 {
		return 0
	}
	from := h.Starts
	if now.After(from) {
		from = now
	}
	remaining := h.Ends.Sub(from)
	if remaining <= 0 {
		return 0
	}
	// Seconds keep the product in int64: 10^9 Rial × 3·10^7 s ≈ 3·10^16.
	return h.PaidRial * int64(remaining/time.Second) / int64(total/time.Second)
}

// RefundWindow is how long after payment a refund can be requested (SCOPE §6).
const RefundWindow = 7 * 24 * time.Hour

// RefundEligible reports whether an order paid at paidAt can be refunded at now, given whether any paid
// feature of its subscription has been used.
func RefundEligible(now, paidAt time.Time, used bool) bool {
	return !used && !now.After(paidAt.Add(RefundWindow))
}
