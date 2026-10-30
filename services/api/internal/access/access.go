// Package access is the single source of truth for what each subscription tier may use
// (ADR-0010). Handlers call Allowed/Limit; UIs receive the evaluated map via the
// entitlements endpoint and never keep their own copy of the matrix.
//
// To change what a tier can do, edit minTier / limits below and update access_test.go.
package access

import "slices"

// Tier is a subscription level. Its order is defined by rank.
type Tier string

// Subscription tiers, lowest first.
const (
	Free   Tier = "free"
	Silver Tier = "silver"
	Gold   Tier = "gold"
)

var rank = map[Tier]int{Free: 0, Silver: 1, Gold: 2}

// Tiers lists all tiers from lowest to highest.
var Tiers = []Tier{Free, Silver, Gold}

// Valid reports whether t is a known tier.
func (t Tier) Valid() bool { _, ok := rank[t]; return ok }

// AtLeast reports whether t is the same as or higher than other.
func (t Tier) AtLeast(other Tier) bool { return t.Valid() && rank[t] >= rank[other] }

// Feature is a gated capability. Keys are stable identifiers shared with the UIs.
type Feature string

// Gated features. Keys are part of the API contract (entitlements) — never rename, only add.
const (
	PricesBase      Feature = "prices.base"      // 7 base metals (ticker, home cards)
	PricesFull      Feature = "prices.full"      // every product, market and source
	ChartBasic      Feature = "chart.basic"      // charts of world prices with limited history
	ChartFull       Feature = "chart.full"       // full history, and the history of IME and market prices
	NewsRead        Feature = "news.read"        // fundamental news (Silver since 2026-10-30)
	AnalysisRead    Feature = "analysis.read"    // expert market analysis
	ForecastRead    Feature = "forecast.read"    // price forecast scenarios
	AuctionsRead    Feature = "auctions.read"    // IME daily auctions data
	CalculatorUse   Feature = "calculator.use"   // load-value calculator
	AlertsSMS       Feature = "alerts.sms"       // SMS price alerts
	SupportPriority Feature = "support.priority" // priority ticket handling
	CommunityRead   Feature = "community.read"   // members' analyses: read them (client, 2026-10-30)
	CommunityPost   Feature = "community.post"   // members' analyses: post one
)

// minTier is the tier matrix (SCOPE.md §6, the client's plan table of 2026-10-26).
// A feature missing here is denied to everyone (deny by default).
var minTier = map[Feature]Tier{
	PricesBase:      Free,
	PricesFull:      Silver,
	ChartBasic:      Free,
	ChartFull:       Silver,
	NewsRead:        Silver, // client + owner, 2026-10-30: fundamental news is for subscribers
	AnalysisRead:    Gold,
	ForecastRead:    Gold,
	AuctionsRead:    Gold,
	CalculatorUse:   Gold,
	AlertsSMS:       Gold,
	SupportPriority: Gold,
	CommunityRead:   Silver,
	CommunityPost:   Silver,
}

// Features returns every known feature in a stable order.
func Features() []Feature {
	fs := make([]Feature, 0, len(minTier))
	for f := range minTier {
		fs = append(fs, f)
	}
	slices.Sort(fs)
	return fs
}

// Allowed reports whether tier t may use feature f.
func Allowed(t Tier, f Feature) bool {
	need, ok := minTier[f]
	return ok && t.AtLeast(need)
}

// RequiredTier returns the lowest tier that unlocks f, used for "upgrade to …" CTAs.
func RequiredTier(f Feature) (Tier, bool) {
	t, ok := minTier[f]
	return t, ok
}

// LimitKey names a numeric limit that varies by tier.
type LimitKey string

const (
	// ChartHistoryDays is the maximum chart range in days; 0 means unlimited.
	ChartHistoryDays LimitKey = "chart.history_days"
)

var limits = map[LimitKey]map[Tier]int{
	ChartHistoryDays: {Free: 30, Silver: 0, Gold: 0},
}

// Limit returns the value of limit k for tier t (0 = unlimited). Unknown tiers get the Free value.
func Limit(t Tier, k LimitKey) int {
	byTier := limits[k]
	if v, ok := byTier[t]; ok {
		return v
	}
	return byTier[Free]
}

// Entitlements is the evaluated feature map for one tier, as sent to the UIs.
func Entitlements(t Tier) map[Feature]bool {
	out := make(map[Feature]bool, len(minTier))
	for f := range minTier {
		out[f] = Allowed(t, f)
	}
	return out
}
