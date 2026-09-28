// Package auctions holds the rules for IME daily offerings (SCOPE §7): validation of a row and the day's summary.
// Information only: there's no bidding on the site. Prices are Rial per kg, weights kg, all integers.
package auctions

import (
	"errors"
	"math"
	"math/big"
)

// Offering is one IME offering as entered or fetched.
type Offering struct {
	OfferedKg         int64
	BasePriceRial     int64
	DemandKg          *int64 // nil until the session closes
	TradedKg          *int64
	ClearingPriceRial *int64
}

// Limits keep one row's value (kg × Rial/kg ≤ 10^18) inside int64; the day's total is summed in big.Int.
const (
	MaxKg   = 1_000_000_000 // 1 million tonnes
	MaxRial = 1_000_000_000 // 100 million Toman per kg
)

// Validation errors.
var (
	ErrOffered  = errors.New("offered volume must be positive")
	ErrBase     = errors.New("base price must be positive")
	ErrTraded   = errors.New("traded volume can't exceed the offered volume")
	ErrClearing = errors.New("clearing price must be positive when there's a trade")
	ErrRange    = errors.New("value out of range")
)

// Validate checks one offering.
func Validate(o Offering) error {
	switch {
	case o.OfferedKg <= 0:
		return ErrOffered
	case o.BasePriceRial <= 0:
		return ErrBase
	case o.OfferedKg > MaxKg || o.BasePriceRial > MaxRial:
		return ErrRange
	}
	for _, v := range []*int64{o.DemandKg, o.TradedKg} {
		if v != nil && (*v < 0 || *v > MaxKg) {
			return ErrRange
		}
	}
	if o.TradedKg != nil && *o.TradedKg > o.OfferedKg {
		return ErrTraded
	}
	if o.ClearingPriceRial != nil && (*o.ClearingPriceRial <= 0 || *o.ClearingPriceRial > MaxRial) {
		return ErrClearing
	}
	if o.TradedKg != nil && *o.TradedKg > 0 && o.ClearingPriceRial == nil {
		return ErrClearing
	}
	return nil
}

// ChangeBp is the clearing price against the base price in basis points (truncated), or false before the trade.
func ChangeBp(o Offering) (int64, bool) {
	if o.ClearingPriceRial == nil {
		return 0, false
	}
	return (*o.ClearingPriceRial - o.BasePriceRial) * 10_000 / o.BasePriceRial, true
}

// Summary is the day's headline numbers (the teaser everyone sees).
type Summary struct {
	Offerings int
	OfferedKg int64
	DemandKg  int64
	TradedKg  int64
	ValueRial int64 // Σ traded × clearing price
	// AvgChangeBp is the traded-volume-weighted change vs base over traded rows (0 when nothing traded).
	AvgChangeBp int64
}

// Summarize totals a day's offerings.
func Summarize(rows []Offering) Summary {
	s := Summary{Offerings: len(rows)}
	weighted, weight, value := new(big.Int), int64(0), new(big.Int)
	for _, o := range rows {
		s.OfferedKg += o.OfferedKg
		if o.DemandKg != nil {
			s.DemandKg += *o.DemandKg
		}
		if o.TradedKg == nil || *o.TradedKg == 0 || o.ClearingPriceRial == nil {
			continue
		}
		s.TradedKg += *o.TradedKg
		value.Add(value, new(big.Int).Mul(big.NewInt(*o.TradedKg), big.NewInt(*o.ClearingPriceRial)))
		bp, _ := ChangeBp(o)
		weighted.Add(weighted, new(big.Int).Mul(big.NewInt(bp), big.NewInt(*o.TradedKg)))
		weight += *o.TradedKg
	}
	s.ValueRial = math.MaxInt64 // saturate: unreachable with real sessions
	if value.IsInt64() {
		s.ValueRial = value.Int64()
	}
	if weight > 0 {
		s.AvgChangeBp = weighted.Quo(weighted, big.NewInt(weight)).Int64()
	}
	return s
}
