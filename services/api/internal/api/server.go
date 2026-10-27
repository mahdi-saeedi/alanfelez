// Package api implements the HTTP API defined in contracts/openapi.yaml.
// api.gen.go is generated (task generate) — never edit it by hand.
package api

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/billing"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/ratelimit"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
	"github.com/alanfelez/alanfelez/services/api/internal/subscription"
	"github.com/alanfelez/alanfelez/services/api/internal/support"
)

//go:generate go tool oapi-codegen -config ../../oapi-codegen.yaml ../../../../contracts/openapi.yaml

// Server implements the generated StrictServerInterface. Handlers stay thin:
// parse → call a query/service → map to the API model.
type Server struct {
	pool    *pgxpool.Pool
	q       dbq.Querier
	prices  *prices.Service
	billing *billing.Service
	support *support.Service
	limiter ratelimit.Limiter
	log     *slog.Logger
	tiers   *subscription.Resolver
	now     func() time.Time
	gateway string // payment gateway name (mock, none, …): the flags screen won't switch payments on without a real one
}

// Option customises a Server.
type Option func(*Server)

// WithLimiter sets the rate limiter for anonymous writes (default: none).
func WithLimiter(l ratelimit.Limiter) Option { return func(s *Server) { s.limiter = l } }

// WithGateway records the payment gateway's name (default: none).
func WithGateway(name string) Option { return func(s *Server) { s.gateway = name } }

// WithLogger sets the logger for handler events (default: slog.Default()).
func WithLogger(l *slog.Logger) Option { return func(s *Server) { s.log = l } }

func (s *Server) logger() *slog.Logger {
	if s.log == nil {
		return slog.Default()
	}
	return s.log
}

// NewServer wires the API implementation.
func NewServer(pool *pgxpool.Pool, ps *prices.Service, bs *billing.Service, opts ...Option) *Server {
	q := dbq.New(pool)
	s := &Server{
		pool: pool, q: q, prices: ps, billing: bs, support: support.NewService(pool), limiter: ratelimit.None{},
		tiers: subscription.NewResolver(q), now: time.Now,
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

var _ StrictServerInterface = (*Server)(nil)

// ListMetals returns base metals in display order.
func (s *Server) ListMetals(ctx context.Context, req ListMetalsRequestObject) (ListMetalsResponseObject, error) {
	rows, err := s.q.ListMetals(ctx)
	if err != nil {
		return nil, fmt.Errorf("list metals: %w", err)
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	items := make([]Metal, 0, len(rows))
	for _, r := range rows {
		items = append(items, Metal{Slug: r.Slug, Name: localized(lang, r.NameFa, r.NameEn)})
	}
	return ListMetals200JSONResponse{Items: items}, nil
}

// ListCategories returns product categories in display order.
func (s *Server) ListCategories(ctx context.Context, req ListCategoriesRequestObject) (ListCategoriesResponseObject, error) {
	rows, err := s.q.ListCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	items := make([]Localized, 0, len(rows))
	for _, r := range rows {
		items = append(items, Localized{Slug: r.Slug, Name: localized(lang, r.NameFa, r.NameEn)})
	}
	return ListCategories200JSONResponse{Items: items}, nil
}

// ListMarkets returns markets / price sources in display order.
func (s *Server) ListMarkets(ctx context.Context, req ListMarketsRequestObject) (ListMarketsResponseObject, error) {
	rows, err := s.q.ListMarkets(ctx)
	if err != nil {
		return nil, fmt.Errorf("list markets: %w", err)
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	items := make([]Market, 0, len(rows))
	for _, r := range rows {
		items = append(items, Market{Slug: r.Slug, Name: localized(lang, r.NameFa, r.NameEn), Scope: MarketScope(r.Scope)})
	}
	return ListMarkets200JSONResponse{Items: items}, nil
}

// ListPlans returns active plans with their current prices.
func (s *Server) ListPlans(ctx context.Context, req ListPlansRequestObject) (ListPlansResponseObject, error) {
	plans, err := s.q.ListActivePlans(ctx)
	if err != nil {
		return nil, fmt.Errorf("list plans: %w", err)
	}
	prices, err := s.q.ListCurrentPlanPrices(ctx)
	if err != nil {
		return nil, fmt.Errorf("list plan prices: %w", err)
	}
	byPlan := make(map[string][]PlanPrice, len(plans))
	for _, p := range prices {
		byPlan[p.PlanCode] = append(byPlan[p.PlanCode], PlanPrice{
			Period: PlanPricePeriod(p.Period),
			Price:  Money{Amount: strconv.FormatInt(p.AmountRial, 10), Currency: IRR},
		})
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	items := make([]Plan, 0, len(plans))
	for _, p := range plans {
		features := map[string]bool{}
		for f, ok := range access.Entitlements(access.Tier(p.Code)) {
			features[string(f)] = ok
		}
		items = append(items, Plan{
			Code:     Tier(p.Code),
			Name:     localized(lang, p.NameFa, p.NameEn),
			Rank:     int(p.Rank),
			Prices:   append([]PlanPrice{}, byPlan[p.Code]...),
			Features: features,
			Limits:   map[string]int{string(access.ChartHistoryDays): access.Limit(access.Tier(p.Code), access.ChartHistoryDays)},
		})
	}
	purchasable, err := s.q.FeatureEnabled(ctx, "payments.enabled")
	if err != nil {
		return nil, fmt.Errorf("feature flag: %w", err)
	}
	return ListPlans200JSONResponse{Items: items, Purchasable: purchasable}, nil
}

// langOf normalises the Accept-Language parameter; Persian is the default locale.
func langOf(v *string) string {
	if v != nil && *v == "en" {
		return "en"
	}
	return "fa"
}

// localized picks the English value when requested and present, otherwise Persian.
func localized(lang, fa string, en pgtype.Text) string {
	if lang == "en" && en.Valid && en.String != "" {
		return en.String
	}
	return fa
}
