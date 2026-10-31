// Package calculator estimates the value of a metal load (SCOPE.md §8).
// All arithmetic is integer (Rial, grams, basis points) with explicit half-up rounding,
// so results are reproducible and identical across services.
package calculator

import (
	"errors"
	"fmt"
	"math/big"
)

// Party identifies who pays shipping.
type Party string

// Who pays shipping.
const (
	SellerPays Party = "seller" // shipping is deducted from the load value
	BuyerPays  Party = "buyer"  // shipping is added to the load value
)

const bpScale = 10_000 // 100 % in basis points

// Input uses integer units only: 10 % = 1000 basis points, 1 kg = 1000 g.
type Input struct {
	WeightGrams        int64 `json:"weightGrams"`
	UnitPriceRialPerKg int64 `json:"unitPriceRialPerKg"` // base price, or the user's manual price
	// MoistureBP is the water in the load as weighed (aluminium turnings, cans, concentrates): it comes off first.
	MoistureBP int64 `json:"moistureBp,omitempty"`
	// ImpurityBP is dirt, oil, iron and other foreign material, as a share of the dry weight.
	ImpurityBP int64 `json:"impurityBp"`
	// RecoveryBP is the share of the clean weight that is the payable metal: the copper in insulated cable, the
	// metal content of a concentrate or alloy. 0 or absent means 100 % (bare, clean metal).
	RecoveryBP     int64 `json:"recoveryBp,omitempty"`
	DeductionBP    int64 `json:"deductionBp"`
	ShippingRial   int64 `json:"shippingRial"`
	ShippingPaidBy Party `json:"shippingPaidBy"`
}

// Result is the breakdown shown in the result panel.
type Result struct {
	DryWeightGrams   int64 `json:"dryWeightGrams"`   // after moisture
	CleanWeightGrams int64 `json:"cleanWeightGrams"` // after impurity
	NetWeightGrams   int64 `json:"netWeightGrams"`   // payable metal, after recovery
	GrossRial        int64 `json:"grossRial"`
	DeductionsRial   int64 `json:"deductionsRial"`
	ShippingRial     int64 `json:"shippingRial"`
	ValueRial        int64 `json:"valueRial"`
}

// ErrInvalidInput wraps every validation failure.
var ErrInvalidInput = errors.New("calculator: invalid input")

// Estimate computes, the way scrap and concentrate loads are settled (wet weight → dry → clean → payable metal):
//
//	dry        = weight × (1 − moisture)
//	clean      = dry × (1 − impurity)
//	net        = clean × recovery            (recovery 100 % unless given)
//	gross      = net[kg] × unitPrice
//	deductions = gross × deduction
//	value      = gross − deductions − shipping  (seller pays)
//	           | gross − deductions + shipping  (buyer pays)
//
// Each step is rounded half-up to the nearest integer unit.
func Estimate(in Input) (Result, error) {
	if err := in.validate(); err != nil {
		return Result{}, err
	}
	recovery := in.RecoveryBP
	if recovery == 0 {
		recovery = bpScale
	}
	dry := mulDivHalfUp(in.WeightGrams, bpScale-in.MoistureBP, bpScale)
	clean := mulDivHalfUp(dry, bpScale-in.ImpurityBP, bpScale)
	net := mulDivHalfUp(clean, recovery, bpScale)
	gross := mulDivHalfUp(net, in.UnitPriceRialPerKg, 1000)
	ded := mulDivHalfUp(gross, in.DeductionBP, bpScale)

	value := gross - ded
	if in.ShippingPaidBy == BuyerPays {
		value += in.ShippingRial
	} else {
		value -= in.ShippingRial
	}
	return Result{
		DryWeightGrams:   dry,
		CleanWeightGrams: clean,
		NetWeightGrams:   net,
		GrossRial:        gross,
		DeductionsRial:   ded,
		ShippingRial:     in.ShippingRial,
		ValueRial:        value,
	}, nil
}

// Upper bounds keep every intermediate product well inside int64 after division.
const (
	maxWeightGrams = 100_000_000_000 // 100,000 t
	maxPriceRial   = 1_000_000_000_000
)

func (in Input) validate() error {
	var errs []error
	check := func(ok bool, msg string) {
		if !ok {
			errs = append(errs, errors.New(msg))
		}
	}
	check(in.WeightGrams >= 0 && in.WeightGrams <= maxWeightGrams, "weightGrams out of range")
	check(in.UnitPriceRialPerKg >= 0 && in.UnitPriceRialPerKg <= maxPriceRial, "unitPriceRialPerKg out of range")
	check(in.MoistureBP >= 0 && in.MoistureBP < bpScale, "moistureBp must be 0..9999")
	check(in.ImpurityBP >= 0 && in.ImpurityBP <= bpScale, "impurityBp must be 0..10000")
	check(in.RecoveryBP >= 0 && in.RecoveryBP <= bpScale, "recoveryBp must be 0..10000")
	check(in.DeductionBP >= 0 && in.DeductionBP <= bpScale, "deductionBp must be 0..10000")
	check(in.ShippingRial >= 0 && in.ShippingRial <= maxPriceRial, "shippingRial out of range")
	check(in.ShippingPaidBy == SellerPays || in.ShippingPaidBy == BuyerPays, `shippingPaidBy must be "seller" or "buyer"`)
	if len(errs) > 0 {
		return fmt.Errorf("%w: %w", ErrInvalidInput, errors.Join(errs...))
	}
	return nil
}

// mulDivHalfUp returns round(a*b/d) for non-negative operands without overflow.
func mulDivHalfUp(a, b, d int64) int64 {
	p := new(big.Int).Mul(big.NewInt(a), big.NewInt(b))
	p.Add(p, big.NewInt(d/2))
	return p.Quo(p, big.NewInt(d)).Int64()
}
