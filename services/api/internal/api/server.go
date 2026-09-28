// Package api implements the HTTP API defined in contracts/openapi.yaml.
// api.gen.go is generated (task generate) — never edit it by hand.
package api

import (
	"context"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

//go:generate go tool oapi-codegen -config ../../oapi-codegen.yaml ../../../../contracts/openapi.yaml

// Server implements the generated StrictServerInterface. Handlers stay thin:
// parse → call a query/service → map to the API model.
type Server struct {
	q dbq.Querier
}

// NewServer wires the API implementation.
func NewServer(q dbq.Querier) *Server { return &Server{q: q} }

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
		items = append(items, Plan{
			Code:   PlanCode(p.Code),
			Name:   localized(lang, p.NameFa, p.NameEn),
			Rank:   int(p.Rank),
			Prices: append([]PlanPrice{}, byPlan[p.Code]...),
		})
	}
	return ListPlans200JSONResponse{Items: items}, nil
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
