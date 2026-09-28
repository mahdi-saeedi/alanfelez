// Package demo generates plausible-looking prices for local development and staging demos.
// It must never run in production: the worker only registers it when PRICES_DEMO_ALLOWED=true, and the
// demo source row only exists in the demo seed profile (which production refuses).
//
// Each tick moves every configured series by a small random step, pulled back toward its base price so
// the series don't drift away. On first start it back-fills a year of history (daily, then hourly for
// the last week) so charts have data.
package demo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/rand/v2"
	"sort"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/prices"
	"github.com/alanfelez/alanfelez/services/api/internal/prices/source"
)

// Provider is the provider id in market.sources.
const Provider = "demo"

// Config is the source's config (config/seed/demo/10-demo.yaml).
type Config struct {
	StepBp       int              `json:"step_bp"`       // typical move per tick, basis points
	BackfillDays int              `json:"backfill_days"` // history loaded on first start
	Series       map[string]int64 `json:"series"`        // slug → base price (minor units)
	Seed         uint64           `json:"seed"`          // optional: fixed seed for reproducible tests
}

// Source is the demo generator.
type Source struct {
	cfg   Config
	deps  source.Deps
	rnd   *rand.Rand
	slugs []string
}

// New is the source.Factory for the demo provider.
func New(raw json.RawMessage, deps source.Deps) (source.Fetcher, error) {
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("demo: config: %w", err)
	}
	if len(cfg.Series) == 0 {
		return nil, errors.New("demo: config.series is empty")
	}
	if cfg.StepBp <= 0 {
		cfg.StepBp = 25
	}
	if cfg.BackfillDays < 0 {
		cfg.BackfillDays = 0
	}
	seed := cfg.Seed
	if seed == 0 {
		seed = uint64(time.Now().UnixNano()) //nolint:gosec // demo data, not security relevant
	}
	slugs := make([]string, 0, len(cfg.Series))
	for s := range cfg.Series {
		slugs = append(slugs, s)
	}
	sort.Strings(slugs)                                                                                                // deterministic order for a fixed seed
	return &Source{cfg: cfg, deps: deps, rnd: rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)), slugs: slugs}, nil //nolint:gosec // demo data
}

// Fetch moves every series one step from its latest price.
func (s *Source) Fetch(ctx context.Context, now time.Time) ([]prices.Quote, error) {
	latest := map[string]int64{}
	if s.deps.Latest != nil {
		l, err := s.deps.Latest(ctx)
		if err != nil {
			return nil, err
		}
		latest = l
	}
	at := now.UTC().Truncate(time.Second)
	out := make([]prices.Quote, 0, len(s.slugs))
	for _, slug := range s.slugs {
		base := s.cfg.Series[slug]
		cur, ok := latest[slug]
		if !ok || cur <= 0 {
			cur = base
		}
		out = append(out, prices.Quote{Series: slug, ObservedAt: at, Price: s.step(cur, base, s.cfg.StepBp)})
	}
	return out, nil
}

// Backfill returns history that ends near each base price: daily closes (12:00 Tehran) until a week ago,
// then hourly points. Quotes are in time order per series.
func (s *Source) Backfill(_ context.Context, now time.Time) ([]prices.Quote, error) {
	if s.cfg.BackfillDays == 0 {
		return nil, nil
	}
	times := backfillTimes(now, s.cfg.BackfillDays)
	out := make([]prices.Quote, 0, len(times)*len(s.slugs))
	for _, slug := range s.slugs {
		base := s.cfg.Series[slug]
		// Start somewhere within ±15 % of the base and walk forward; mean reversion brings it back.
		cur := roundNice(int64(float64(base) * (0.85 + 0.3*s.rnd.Float64())))
		for i, t := range times {
			stepBp := s.cfg.StepBp * 4 // a day moves more than a tick
			if i > 0 && t.Sub(times[i-1]) < 24*time.Hour {
				stepBp = s.cfg.StepBp * 2
			}
			cur = s.step(cur, base, stepBp)
			out = append(out, prices.Quote{Series: slug, ObservedAt: t, Price: cur})
		}
	}
	return out, nil
}

// step moves cur by a normally distributed amount of about stepBp, pulled 3 % toward base, capped at ±3 steps.
func (s *Source) step(cur, base int64, stepBp int) int64 {
	c := float64(cur)
	move := c * float64(stepBp) / 10_000 * s.rnd.NormFloat64()
	limit := c * float64(stepBp) * 3 / 10_000
	move = math.Max(-limit, math.Min(limit, move))
	next := c + move + (float64(base)-c)*0.03
	if next < 1 {
		next = 1
	}
	return roundNice(int64(next))
}

// roundNice rounds to 4 significant digits, so demo prices look like quotes (6,412,000 rather than 6,411,873).
func roundNice(v int64) int64 {
	if v < 10_000 {
		return v
	}
	p := int64(1)
	for x := v; x >= 10_000; x /= 10 {
		p *= 10
	}
	return (v + p/2) / p * p
}

func backfillTimes(now time.Time, days int) []time.Time {
	loc := prices.Tehran
	n := now.In(loc)
	var out []time.Time
	weekAgo := now.Add(-7 * 24 * time.Hour)
	for d := days; d >= 7; d-- {
		day := n.AddDate(0, 0, -d)
		out = append(out, time.Date(day.Year(), day.Month(), day.Day(), 12, 0, 0, 0, loc).UTC())
	}
	for t := weekAgo.Truncate(time.Hour).Add(time.Hour); t.Before(now.Add(-time.Hour)); t = t.Add(time.Hour) {
		if len(out) == 0 || t.After(out[len(out)-1]) {
			out = append(out, t.UTC())
		}
	}
	return out
}
