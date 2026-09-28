package access

import "testing"

// expected is written out by hand on purpose: it is the reviewed specification.
// Adding a Feature without adding it here makes TestMatrixIsFullySpecified fail.
var expected = map[Feature]map[Tier]bool{
	PricesBase:      {Free: true, Silver: true, Gold: true},
	PricesFull:      {Free: false, Silver: true, Gold: true},
	ChartBasic:      {Free: true, Silver: true, Gold: true},
	ChartFull:       {Free: false, Silver: true, Gold: true},
	NewsRead:        {Free: true, Silver: true, Gold: true},
	AnalysisRead:    {Free: false, Silver: false, Gold: true},
	ForecastRead:    {Free: false, Silver: false, Gold: true},
	AuctionsRead:    {Free: false, Silver: false, Gold: true},
	CalculatorUse:   {Free: false, Silver: false, Gold: true},
	AlertsSMS:       {Free: false, Silver: false, Gold: true},
	SupportPriority: {Free: false, Silver: false, Gold: true},
}

func TestMatrixIsFullySpecified(t *testing.T) {
	for _, f := range Features() {
		if _, ok := expected[f]; !ok {
			t.Errorf("feature %q has no expectation in access_test.go", f)
		}
	}
	if len(expected) != len(Features()) {
		t.Errorf("expected has %d features, matrix has %d", len(expected), len(Features()))
	}
}

func TestAllowed_EveryTierAndFeature(t *testing.T) {
	for f, byTier := range expected {
		for _, tier := range Tiers {
			if got, want := Allowed(tier, f), byTier[tier]; got != want {
				t.Errorf("Allowed(%s, %s) = %v, want %v", tier, f, got, want)
			}
		}
	}
}

func TestAllowed_DenyByDefault(t *testing.T) {
	if Allowed(Gold, Feature("does.not.exist")) {
		t.Error("unknown feature must be denied")
	}
	if Allowed(Tier("platinum"), PricesBase) {
		t.Error("unknown tier must be denied")
	}
}

func TestLimit_ChartHistory(t *testing.T) {
	cases := map[Tier]int{Free: 30, Silver: 0, Gold: 0, Tier("unknown"): 30}
	for tier, want := range cases {
		if got := Limit(tier, ChartHistoryDays); got != want {
			t.Errorf("Limit(%s) = %d, want %d", tier, got, want)
		}
	}
}

func TestEntitlements_MatchesAllowed(t *testing.T) {
	for _, tier := range Tiers {
		for f, ok := range Entitlements(tier) {
			if ok != Allowed(tier, f) {
				t.Errorf("Entitlements(%s)[%s] disagrees with Allowed", tier, f)
			}
		}
	}
}
