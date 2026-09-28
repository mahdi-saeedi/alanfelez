package calculator

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
)

// The golden vectors in testdata/vectors.json are the executable specification of the
// formula. Any client-side preview must reproduce them exactly.
func TestEstimate_GoldenVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vectors []struct {
		Name  string `json:"name"`
		Input Input  `json:"input"`
		Want  Result `json:"want"`
	}
	if err := json.Unmarshal(raw, &vectors); err != nil {
		t.Fatal(err)
	}
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) {
			got, err := Estimate(v.Input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != v.Want {
				t.Errorf("got %+v\nwant %+v", got, v.Want)
			}
		})
	}
}

func TestEstimate_RejectsInvalidInput(t *testing.T) {
	valid := Input{WeightGrams: 1000, UnitPriceRialPerKg: 1000, ShippingPaidBy: SellerPays}
	cases := map[string]func(*Input){
		"negative weight":      func(in *Input) { in.WeightGrams = -1 },
		"impurity over 100%":   func(in *Input) { in.ImpurityBP = 10_001 },
		"negative deduction":   func(in *Input) { in.DeductionBP = -5 },
		"unknown party":        func(in *Input) { in.ShippingPaidBy = "nobody" },
		"price above maximum":  func(in *Input) { in.UnitPriceRialPerKg = maxPriceRial + 1 },
		"weight above maximum": func(in *Input) { in.WeightGrams = maxWeightGrams + 1 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			in := valid
			mutate(&in)
			if _, err := Estimate(in); !errors.Is(err, ErrInvalidInput) {
				t.Errorf("want ErrInvalidInput, got %v", err)
			}
		})
	}
}
