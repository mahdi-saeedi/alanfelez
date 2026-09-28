package auctions

import (
	"errors"
	"testing"
)

func p(v int64) *int64 { return &v }

func TestValidate(t *testing.T) {
	ok := Offering{OfferedKg: 100_000, BasePriceRial: 1_800_000}
	cases := []struct {
		name string
		o    Offering
		want error
	}{
		{"before the session", ok, nil},
		{"after the session", Offering{OfferedKg: 100_000, BasePriceRial: 1_800_000, DemandKg: p(250_000), TradedKg: p(100_000), ClearingPriceRial: p(1_950_000)}, nil},
		{"unsold", Offering{OfferedKg: 100_000, BasePriceRial: 1_800_000, DemandKg: p(0), TradedKg: p(0)}, nil},
		{"no volume", Offering{BasePriceRial: 1}, ErrOffered},
		{"no base price", Offering{OfferedKg: 1}, ErrBase},
		{"traded more than offered", Offering{OfferedKg: 10, BasePriceRial: 1, TradedKg: p(11), ClearingPriceRial: p(1)}, ErrTraded},
		{"traded without a price", Offering{OfferedKg: 10, BasePriceRial: 1, TradedKg: p(5)}, ErrClearing},
		{"absurd volume", Offering{OfferedKg: MaxKg + 1, BasePriceRial: 1}, ErrRange},
		{"negative demand", Offering{OfferedKg: 10, BasePriceRial: 1, DemandKg: p(-1)}, ErrRange},
	}
	for _, c := range cases {
		if err := Validate(c.o); !errors.Is(err, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, err, c.want)
		}
	}
}

func TestSummarize(t *testing.T) {
	rows := []Offering{
		// +10 % on 100 t, −5 % on 300 t → weighted (1000·100 − 500·300)/400 = −125 bp
		{OfferedKg: 100_000, BasePriceRial: 1_000_000, DemandKg: p(200_000), TradedKg: p(100_000), ClearingPriceRial: p(1_100_000)},
		{OfferedKg: 400_000, BasePriceRial: 2_000_000, DemandKg: p(300_000), TradedKg: p(300_000), ClearingPriceRial: p(1_900_000)},
		{OfferedKg: 50_000, BasePriceRial: 3_000_000}, // not traded yet
	}
	s := Summarize(rows)
	want := Summary{Offerings: 3, OfferedKg: 550_000, DemandKg: 500_000, TradedKg: 400_000,
		ValueRial: 100_000*1_100_000 + 300_000*1_900_000, AvgChangeBp: -125}
	if s != want {
		t.Fatalf("got %+v\nwant %+v", s, want)
	}
	if bp, ok := ChangeBp(rows[0]); !ok || bp != 1000 {
		t.Fatalf("change = %d %v", bp, ok)
	}
	if _, ok := ChangeBp(rows[2]); ok {
		t.Fatal("no change before the trade")
	}
	if Summarize(nil) != (Summary{}) {
		t.Fatal("empty day")
	}
}
