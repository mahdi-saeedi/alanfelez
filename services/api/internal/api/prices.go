package api

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// ListPrices returns the latest price per visible series. Locked series are counted, never returned.
func (s *Server) ListPrices(ctx context.Context, req ListPricesRequestObject) (ListPricesResponseObject, error) {
	cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))
	if err != nil {
		return nil, err
	}
	seeAll := access.Allowed(cur.Tier, access.PricesFull)
	rows, err := s.q.ListLatestPrices(ctx, false)
	if err != nil {
		return nil, fmt.Errorf("list latest prices: %w", err)
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	p := req.Params
	out := PriceList{Items: make([]PriceRow, 0, len(rows))}
	for _, r := range rows {
		if (p.Metal != nil && *p.Metal != r.MetalSlug) || (p.Category != nil && *p.Category != r.CategorySlug) ||
			(p.Market != nil && *p.Market != r.MarketSlug) {
			continue
		}
		if !seeAll && !r.IsBase {
			out.LockedCount++
			continue
		}
		out.Items = append(out.Items, priceRow(lang, r))
	}
	if out.LockedCount > 0 {
		plan, _ := access.RequiredTier(access.PricesFull)
		out.LockedFeature = &FeatureLock{Feature: string(access.PricesFull), RequiredPlan: Tier(plan)}
	}
	return ListPrices200JSONResponse{Body: out, Headers: ListPrices200ResponseHeaders{CacheControl: cacheControl(ctx, 5)}}, nil
}

// ListSeriesPoints returns downsampled history, limited by the caller's tier.
func (s *Server) ListSeriesPoints(ctx context.Context, req ListSeriesPointsRequestObject) (ListSeriesPointsResponseObject, error) {
	sr, err := s.q.GetSeriesBySlug(ctx, req.Slug)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !sr.Active) {
		return ListSeriesPoints404ApplicationProblemPlusJSONResponse(notFound(ctx, "series")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("get series: %w", err)
	}
	cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))
	if err != nil {
		return nil, err
	}
	if !sr.IsBase && !access.Allowed(cur.Tier, access.PricesFull) {
		return ListSeriesPoints403ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(lockedProblem(ctx, access.PricesFull))}, nil
	}
	rng := Range1M
	if req.Params.Range != nil {
		rng = *req.Params.Range
	}
	r := prices.Range(rng)
	if _, err := r.Days(); err != nil {
		return ListSeriesPointsdefaultApplicationProblemPlusJSONResponse{Body: badRequest(ctx, "unknown range"), StatusCode: 400}, nil
	}
	if !r.AllowedBy(access.Limit(cur.Tier, access.ChartHistoryDays)) {
		return ListSeriesPoints403ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(lockedProblem(ctx, access.ChartFull))}, nil
	}

	lang := langOf((*string)(req.Params.AcceptLanguage))
	now := s.now().UTC()
	hist := SeriesHistory{Series: seriesRef(lang, seriesInfoOf(sr)), Range: rng, From: now, To: now, Points: []SeriesPoint{}}
	first, err := s.q.FirstPointAt(ctx, sr.ID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("first point: %w", err)
	}
	if !first.Valid {
		return ListSeriesPoints200JSONResponse(hist), nil
	}
	since, bucket, err := prices.Window(r, now, first.Time)
	if err != nil {
		return nil, err
	}
	if since.Before(first.Time) {
		since = first.Time
	}
	pts, err := s.q.SeriesPoints(ctx, dbq.SeriesPointsParams{
		SeriesID: sr.ID, Since: pgtype.Timestamptz{Time: since, Valid: true}, Until: pgtype.Timestamptz{Time: now, Valid: true},
		BucketSeconds: int32(bucket), //nolint:gosec // bucket sizes are small constants (prices.bucketSteps)
	})
	if err != nil {
		return nil, fmt.Errorf("series points: %w", err)
	}
	hist.From, hist.IntervalSeconds = since.UTC(), bucket
	for _, p := range pts {
		hist.Points = append(hist.Points, SeriesPoint{T: p.T.Time.UTC(), Amount: i64s(p.PriceMinor)})
	}
	return ListSeriesPoints200JSONResponse(hist), nil
}

// GetEntitlements returns the evaluated feature map; the UIs render 🔒 from it and never keep their own matrix.
func (s *Server) GetEntitlements(ctx context.Context, _ GetEntitlementsRequestObject) (GetEntitlementsResponseObject, error) {
	p := auth.FromContext(ctx)
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	features := map[string]bool{}
	for f, ok := range access.Entitlements(cur.Tier) {
		features[string(f)] = ok
	}
	body := Entitlements{
		Authenticated: p != nil,
		Tier:          Tier(cur.Tier),
		TierEndsAt:    cur.EndsAt,
		Features:      features,
		Limits:        map[string]int{string(access.ChartHistoryDays): access.Limit(cur.Tier, access.ChartHistoryDays)},
	}
	return GetEntitlements200JSONResponse{Body: body, Headers: GetEntitlements200ResponseHeaders{CacheControl: strp("private, no-store")}}, nil
}

// Snapshot is the SSE bootstrap: the latest price of every active series (internal/prices/live).
func (s *Server) Snapshot(ctx context.Context) ([]prices.Event, error) {
	rows, err := s.q.ListLatestPrices(ctx, false)
	if err != nil {
		return nil, fmt.Errorf("snapshot: %w", err)
	}
	out := make([]prices.Event, 0, len(rows))
	for _, r := range rows {
		if !r.PriceMinor.Valid {
			continue
		}
		ev := prices.Event{
			PointID: r.PointID.Int64, SeriesID: r.ID, Series: r.Slug, IsBase: r.IsBase, Currency: r.Currency, Unit: r.Unit,
			Price: r.PriceMinor.Int64, ObservedAt: r.ObservedAt.Time.UTC(),
		}
		if r.PrevCloseMinor.Valid {
			v := r.PrevCloseMinor.Int64
			ev.PrevClose = &v
		}
		out = append(out, ev)
	}
	return out, nil
}

// SeesAllSeries reports whether the caller may see every series (for the SSE stream).
func (s *Server) SeesAllSeries(ctx context.Context) (bool, error) {
	cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))
	if err != nil {
		return false, err
	}
	return access.Allowed(cur.Tier, access.PricesFull), nil
}

// seriesInfo is the descriptive part shared by the series queries.
type seriesInfo struct {
	Slug, Currency, Unit              string
	IsBase                            bool
	ProductSlug, ProductFa            string
	ProductEn                         pgtype.Text
	MetalSlug, MetalFa                string
	MetalEn                           pgtype.Text
	CategorySlug, CategoryFa          string
	CategoryEn                        pgtype.Text
	MarketSlug, MarketFa, MarketScope string
	MarketEn                          pgtype.Text
}

func seriesInfoOf(r dbq.GetSeriesBySlugRow) seriesInfo {
	return seriesInfo{
		Slug: r.Slug, Currency: r.Currency, Unit: r.Unit, IsBase: r.IsBase,
		ProductSlug: r.ProductSlug, ProductFa: r.ProductFa, ProductEn: r.ProductEn,
		MetalSlug: r.MetalSlug, MetalFa: r.MetalFa, MetalEn: r.MetalEn,
		CategorySlug: r.CategorySlug, CategoryFa: r.CategoryFa, CategoryEn: r.CategoryEn,
		MarketSlug: r.MarketSlug, MarketFa: r.MarketFa, MarketScope: r.MarketScope, MarketEn: r.MarketEn,
	}
}

func seriesRef(lang string, i seriesInfo) SeriesRef {
	return SeriesRef{
		Slug:     i.Slug,
		Product:  Localized{Slug: i.ProductSlug, Name: localized(lang, i.ProductFa, i.ProductEn)},
		Metal:    Localized{Slug: i.MetalSlug, Name: localized(lang, i.MetalFa, i.MetalEn)},
		Category: Localized{Slug: i.CategorySlug, Name: localized(lang, i.CategoryFa, i.CategoryEn)},
		Market:   Market{Slug: i.MarketSlug, Name: localized(lang, i.MarketFa, i.MarketEn), Scope: MarketScope(i.MarketScope)},
		Currency: Currency(i.Currency),
		Unit:     Unit(i.Unit),
		IsBase:   i.IsBase,
	}
}

func priceRow(lang string, r dbq.ListLatestPricesRow) PriceRow {
	row := PriceRow{Series: seriesRef(lang, seriesInfo{
		Slug: r.Slug, Currency: r.Currency, Unit: r.Unit, IsBase: r.IsBase,
		ProductSlug: r.ProductSlug, ProductFa: r.ProductFa, ProductEn: r.ProductEn,
		MetalSlug: r.MetalSlug, MetalFa: r.MetalFa, MetalEn: r.MetalEn,
		CategorySlug: r.CategorySlug, CategoryFa: r.CategoryFa, CategoryEn: r.CategoryEn,
		MarketSlug: r.MarketSlug, MarketFa: r.MarketFa, MarketScope: r.MarketScope, MarketEn: r.MarketEn,
	})}
	if !r.PriceMinor.Valid {
		return row
	}
	row.Price = &Price{Amount: i64s(r.PriceMinor.Int64), Currency: Currency(r.Currency), Unit: Unit(r.Unit)}
	row.ObservedAt = timep(r.ObservedAt)
	var prev *int64
	if r.PrevCloseMinor.Valid {
		prev = &r.PrevCloseMinor.Int64
	}
	if ch, ok := prices.ChangeFrom(prev, r.PriceMinor.Int64); ok {
		row.Change = &PriceChange{Amount: i64s(ch.Amount), Bp: int(ch.Bp)}
	}
	// Manual entries show the market as their source; the internal "manual" flag isn't public (SECURITY §6).
	src := localized(lang, r.MarketFa, r.MarketEn)
	if r.SourceProvider.Valid && r.SourceProvider.String != "manual" {
		src = localized(lang, r.SourceFa.String, r.SourceEn)
	}
	row.Source = &src
	return row
}

// Range1M is the default chart range.
const Range1M = N1M
