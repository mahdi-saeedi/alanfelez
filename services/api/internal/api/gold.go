package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/alerts"
	"github.com/alanfelez/alanfelez/services/api/internal/auctions"
	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/calculator"
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Limits for saved things (🛠 SCOPE §17).
const maxCalculations = 50

// --- IME daily offerings ------------------------------------------------------------

// GetAuctions returns one day of IME offerings. The summary is public; rows need auctions.read.
func (s *Server) GetAuctions(ctx context.Context, req GetAuctionsRequestObject) (GetAuctionsResponseObject, error) {
	lang := langOf((*string)(req.Params.AcceptLanguage))
	dates, err := s.q.ImeDates(ctx)
	if err != nil {
		return nil, fmt.Errorf("ime dates: %w", err)
	}
	cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))
	if err != nil {
		return nil, err
	}
	day := AuctionDay{Dates: make([]openapi_types.Date, 0, len(dates)), Source: s.imeSourceName(ctx, lang), Summary: summaryOf(auctions.Summary{})}
	for _, d := range dates {
		day.Dates = append(day.Dates, openapi_types.Date{Time: d.Time})
	}
	day.Locked, day.RequiredPlan = featureLock(cur.Tier, access.AuctionsRead)
	var date pgtype.Date
	switch {
	case req.Params.Date != nil:
		date = pgtype.Date{Time: req.Params.Date.Time, Valid: true}
	case len(dates) > 0:
		date = dates[0]
	default:
		return GetAuctions200JSONResponse(day), nil
	}
	day.Date = &openapi_types.Date{Time: date.Time}
	rows, err := s.q.ListImeOfferings(ctx, dbq.ListImeOfferingsParams{TradeDate: date, Metal: textOfPtr(req.Params.Metal)})
	if err != nil {
		return nil, fmt.Errorf("ime offerings: %w", err)
	}
	all := make([]auctions.Offering, 0, len(rows))
	items := make([]AuctionOffering, 0, len(rows))
	var updated time.Time
	for _, r := range rows {
		o := offeringOf(r.OfferedKg, r.BasePriceRial, r.DemandKg, r.TradedKg, r.ClearingPriceRial)
		all = append(all, o)
		if r.UpdatedAt.Time.After(updated) {
			updated = r.UpdatedAt.Time
		}
		item := AuctionOffering{
			Id: r.ID.Bytes, Metal: Localized{Slug: r.MetalSlug, Name: localized(lang, r.MetalFa, r.MetalEn)},
			Product: localized(lang, r.ProductFa, r.ProductEn), Producer: localized(lang, r.ProducerFa, r.ProducerEn),
			OfferedKg: r.OfferedKg, BasePriceRial: r.BasePriceRial, DemandKg: i64p(r.DemandKg), TradedKg: i64p(r.TradedKg),
			ClearingPriceRial: i64p(r.ClearingPriceRial),
		}
		if bp, ok := auctions.ChangeBp(o); ok {
			v := int(bp)
			item.ChangeBp = &v
		}
		items = append(items, item)
	}
	day.Summary = summaryOf(auctions.Summarize(all))
	if !updated.IsZero() {
		u := updated.UTC()
		day.UpdatedAt = &u
	}
	if !day.Locked {
		day.Items = &items
		if len(items) > 0 && !access.Allowed(access.Free, access.AuctionsRead) {
			s.billing.RecordUsage(ctx, cur.SubscriptionID, access.AuctionsRead)
		}
	}
	return GetAuctions200JSONResponse(day), nil
}

func (s *Server) imeSourceName(ctx context.Context, lang string) string {
	markets, err := s.q.ListMarkets(ctx)
	if err == nil {
		for _, m := range markets {
			if m.Slug == "ime" {
				return localized(lang, m.NameFa, m.NameEn)
			}
		}
	}
	if lang == "en" {
		return "Iran Mercantile Exchange"
	}
	return "بورس کالای ایران"
}

func summaryOf(v auctions.Summary) AuctionSummary {
	return AuctionSummary{
		Offerings: v.Offerings, OfferedKg: v.OfferedKg, DemandKg: v.DemandKg, TradedKg: v.TradedKg,
		Value: rial(v.ValueRial), AvgChangeBp: int(v.AvgChangeBp),
	}
}

func offeringOf(offered, base int64, demand, traded, clearing pgtype.Int8) auctions.Offering {
	return auctions.Offering{OfferedKg: offered, BasePriceRial: base, DemandKg: i64p(demand), TradedKg: i64p(traded), ClearingPriceRial: i64p(clearing)}
}

// --- calculator ---------------------------------------------------------------------

// EstimateLoad runs the load-value calculator (Gold).
func (s *Server) EstimateLoad(ctx context.Context, req EstimateLoadRequestObject) (EstimateLoadResponseObject, error) {
	cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))
	if err != nil {
		return nil, err
	}
	if !access.Allowed(cur.Tier, access.CalculatorUse) {
		return fail[EstimateLoaddefaultApplicationProblemPlusJSONResponse](lockedProblem(ctx, access.CalculatorUse)), nil
	}
	res, msg, err := s.estimate(ctx, *req.Body, langOf(nil))
	if err != nil {
		return nil, err
	}
	if msg != "" {
		return fail[EstimateLoaddefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	s.billing.RecordUsage(ctx, cur.SubscriptionID, access.CalculatorUse)
	return EstimateLoad200JSONResponse(res), nil
}

// estimate resolves the base price and runs calculator.Estimate. msg is the 400 detail for bad input.
func (s *Server) estimate(ctx context.Context, in CalculatorInput, lang string) (CalculatorResult, string, error) {
	out := CalculatorResult{Input: in}
	if in.Series != nil && *in.Series != "" {
		sr, err := s.q.GetSeriesBySlug(ctx, *in.Series)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !sr.Active) {
			return out, "unknown series", nil
		}
		if err != nil {
			return out, "", fmt.Errorf("series: %w", err)
		}
		if sr.Currency != "IRR" {
			return out, "the calculator uses Rial prices (domestic series)", nil
		}
		latest, err := s.q.GetLatestPrice(ctx, sr.ID)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			if in.UnitPriceRialPerKg == nil {
				return out, "this series has no price yet: enter a price", nil
			}
		case err != nil:
			return out, "", fmt.Errorf("latest price: %w", err)
		default:
			perKg := latest.PriceMinor
			if sr.Unit == "ton" {
				perKg = latest.PriceMinor / 1000
			}
			out.Price = &CalculatorPrice{
				Series: sr.Slug, Product: localized(lang, sr.ProductFa, sr.ProductEn),
				Source: strp(localized(lang, latest.MarketFa, latest.MarketEn)), ObservedAt: latest.ObservedAt.Time.UTC(),
			}
			if in.UnitPriceRialPerKg == nil {
				out.Input.UnitPriceRialPerKg = &perKg
			}
		}
	}
	if out.Input.UnitPriceRialPerKg == nil {
		return out, "choose a product or enter a price", nil
	}
	r, err := calculator.Estimate(calculator.Input{
		WeightGrams: in.WeightGrams, UnitPriceRialPerKg: *out.Input.UnitPriceRialPerKg, ImpurityBP: int64(in.ImpurityBp),
		DeductionBP: int64(in.DeductionBp), ShippingRial: in.ShippingRial, ShippingPaidBy: calculator.Party(in.ShippingPaidBy),
	})
	if errors.Is(err, calculator.ErrInvalidInput) {
		return out, err.Error(), nil
	}
	if err != nil {
		return out, "", err
	}
	out.NetWeightGrams, out.GrossRial, out.DeductionsRial, out.ShippingRial, out.ValueRial = r.NetWeightGrams, r.GrossRial, r.DeductionsRial, r.ShippingRial, r.ValueRial
	return out, "", nil
}

// ListMyCalculations lists saved calculations (also after the plan lapses, so they can be deleted).
func (s *Server) ListMyCalculations(ctx context.Context, _ ListMyCalculationsRequestObject) (ListMyCalculationsResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[ListMyCalculationsdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	rows, err := s.q.ListCalculations(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("calculations: %w", err)
	}
	items := make([]SavedCalculation, 0, len(rows))
	for _, r := range rows {
		var res CalculatorResult
		if err := json.Unmarshal(r.Result, &res); err != nil {
			return nil, fmt.Errorf("calculation %s: %w", *uuidString(r.ID), err)
		}
		items = append(items, SavedCalculation{Id: r.ID.Bytes, Name: r.Name, Result: res, CreatedAt: r.CreatedAt.Time.UTC()})
	}
	return ListMyCalculations200JSONResponse{Items: items}, nil
}

// SaveMyCalculation computes and stores a calculation (Gold).
func (s *Server) SaveMyCalculation(ctx context.Context, req SaveMyCalculationRequestObject) (SaveMyCalculationResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[SaveMyCalculationdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	if !access.Allowed(cur.Tier, access.CalculatorUse) {
		return fail[SaveMyCalculationdefaultApplicationProblemPlusJSONResponse](lockedProblem(ctx, access.CalculatorUse)), nil
	}
	name, ok := content.Clean(req.Body.Name, 1, 80)
	if !ok {
		return fail[SaveMyCalculationdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "name must be 1–80 characters")), nil
	}
	res, msg, err := s.estimate(ctx, req.Body.Input, "fa")
	if err != nil {
		return nil, err
	}
	if msg != "" {
		return fail[SaveMyCalculationdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	if _, err := s.touchUser(ctx, p); err != nil {
		return nil, err
	}
	n, err := s.q.CountCalculations(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("count calculations: %w", err)
	}
	if n >= maxCalculations {
		return fail[SaveMyCalculationdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "at most 50 saved calculations: delete some first")), nil
	}
	in, _ := json.Marshal(res.Input)
	out, _ := json.Marshal(res)
	row, err := s.q.InsertCalculation(ctx, dbq.InsertCalculationParams{UserID: p.ID, Name: name, SeriesSlug: textOfPtr(res.Input.Series), Input: in, Result: out})
	if err != nil {
		return nil, fmt.Errorf("save calculation: %w", err)
	}
	s.billing.RecordUsage(ctx, cur.SubscriptionID, access.CalculatorUse)
	return SaveMyCalculation201JSONResponse{Id: row.ID.Bytes, Name: name, Result: res, CreatedAt: row.CreatedAt.Time.UTC()}, nil
}

// DeleteMyCalculation deletes one of the caller's calculations.
func (s *Server) DeleteMyCalculation(ctx context.Context, req DeleteMyCalculationRequestObject) (DeleteMyCalculationResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[DeleteMyCalculationdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	n, err := s.q.DeleteCalculation(ctx, dbq.DeleteCalculationParams{ID: pgtype.UUID{Bytes: req.Id, Valid: true}, UserID: p.ID})
	if err != nil {
		return nil, fmt.Errorf("delete calculation: %w", err)
	}
	if n == 0 {
		return fail[DeleteMyCalculationdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "calculation")), nil
	}
	return DeleteMyCalculation204Response{}, nil
}

// --- SMS price alerts ---------------------------------------------------------------

// ListMyAlerts lists the caller's alerts.
func (s *Server) ListMyAlerts(ctx context.Context, req ListMyAlertsRequestObject) (ListMyAlertsResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[ListMyAlertsdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	rows, err := s.q.ListUserAlerts(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("alerts: %w", err)
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	items := make([]PriceAlert, 0, len(rows))
	for _, r := range rows {
		items = append(items, alertOf(lang, r))
	}
	return ListMyAlerts200JSONResponse{Items: items, Max: alerts.MaxPerUser}, nil
}

// CreateMyAlert adds an alert (Gold).
func (s *Server) CreateMyAlert(ctx context.Context, req CreateMyAlertRequestObject) (CreateMyAlertResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[CreateMyAlertdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	if !access.Allowed(cur.Tier, access.AlertsSMS) {
		return fail[CreateMyAlertdefaultApplicationProblemPlusJSONResponse](lockedProblem(ctx, access.AlertsSMS)), nil
	}
	in := req.Body
	kind := alerts.Kind(in.Kind)
	var threshold, move int64
	if in.Threshold != nil {
		if threshold, err = strconv.ParseInt(strings.TrimSpace(*in.Threshold), 10, 64); err != nil {
			return fail[CreateMyAlertdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "threshold must be an integer amount")), nil
		}
	}
	if in.MoveBp != nil {
		move = int64(*in.MoveBp)
	}
	if err := alerts.Validate(kind, threshold, move); err != nil {
		return fail[CreateMyAlertdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, err.Error())), nil
	}
	if _, err := s.touchUser(ctx, p); err != nil {
		return nil, err
	}
	n, err := s.q.CountUserAlerts(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("count alerts: %w", err)
	}
	if n >= alerts.MaxPerUser {
		return fail[CreateMyAlertdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "at most 20 alerts: delete some first")), nil
	}
	arg := dbq.InsertAlertParams{UserID: p.ID, SeriesSlug: in.Series, Kind: string(kind)}
	if kind == alerts.Move {
		arg.MoveBp = pgtype.Int4{Int32: int32(move), Valid: true} //nolint:gosec // validated 50..5000
	} else {
		arg.ThresholdMinor = pgtype.Int8{Int64: threshold, Valid: true}
	}
	row, err := s.q.InsertAlert(ctx, arg)
	if err != nil {
		if isNotNullViolation(err) { // the series sub-select found nothing
			return fail[CreateMyAlertdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown series")), nil
		}
		return nil, fmt.Errorf("insert alert: %w", err)
	}
	s.billing.RecordUsage(ctx, cur.SubscriptionID, access.AlertsSMS)
	lang := langOf((*string)(req.Params.AcceptLanguage))
	list, err := s.q.ListUserAlerts(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("alerts: %w", err)
	}
	for _, r := range list {
		if r.ID == row.ID {
			return CreateMyAlert201JSONResponse(alertOf(lang, r)), nil
		}
	}
	return nil, errors.New("created alert vanished")
}

// SetMyAlertActive pauses or resumes an alert. Resuming needs the feature (a paused alert of a lapsed plan stays paused).
func (s *Server) SetMyAlertActive(ctx context.Context, req SetMyAlertActiveRequestObject) (SetMyAlertActiveResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[SetMyAlertActivedefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	if req.Body.Active {
		cur, err := s.tiers.Tier(ctx, p)
		if err != nil {
			return nil, err
		}
		if !access.Allowed(cur.Tier, access.AlertsSMS) {
			return fail[SetMyAlertActivedefaultApplicationProblemPlusJSONResponse](lockedProblem(ctx, access.AlertsSMS)), nil
		}
	}
	n, err := s.q.SetAlertActive(ctx, dbq.SetAlertActiveParams{ID: pgtype.UUID{Bytes: req.Id, Valid: true}, UserID: p.ID, Active: req.Body.Active})
	if err != nil {
		return nil, fmt.Errorf("set alert: %w", err)
	}
	if n == 0 {
		return fail[SetMyAlertActivedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "alert")), nil
	}
	return SetMyAlertActive204Response{}, nil
}

// DeleteMyAlert deletes one of the caller's alerts.
func (s *Server) DeleteMyAlert(ctx context.Context, req DeleteMyAlertRequestObject) (DeleteMyAlertResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[DeleteMyAlertdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	n, err := s.q.DeleteAlert(ctx, dbq.DeleteAlertParams{ID: pgtype.UUID{Bytes: req.Id, Valid: true}, UserID: p.ID})
	if err != nil {
		return nil, fmt.Errorf("delete alert: %w", err)
	}
	if n == 0 {
		return fail[DeleteMyAlertdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "alert")), nil
	}
	return DeleteMyAlert204Response{}, nil
}

func alertOf(lang string, r dbq.ListUserAlertsRow) PriceAlert {
	a := PriceAlert{
		Id: r.ID.Bytes, Series: r.SeriesSlug, Product: localized(lang, r.ProductFa, r.ProductEn), Currency: Currency(r.Currency),
		Unit: Unit(r.Unit), Kind: PriceAlertKind(r.Kind), Active: r.Active, LastTriggeredAt: timep(r.LastTriggeredAt), CreatedAt: r.CreatedAt.Time.UTC(),
	}
	if r.ThresholdMinor.Valid {
		a.Threshold = strp(i64s(r.ThresholdMinor.Int64))
	}
	if r.MoveBp.Valid {
		v := int(r.MoveBp.Int32)
		a.MoveBp = &v
	}
	return a
}

// --- admin: IME offerings -------------------------------------------------------------

// AdminListAuctions returns one day's offerings for editing.
func (s *Server) AdminListAuctions(ctx context.Context, req AdminListAuctionsRequestObject) (AdminListAuctionsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListAuctionsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows, err := s.q.ListImeOfferings(ctx, dbq.ListImeOfferingsParams{TradeDate: pgtype.Date{Time: req.Params.Date.Time, Valid: true}})
	if err != nil {
		return nil, fmt.Errorf("ime offerings: %w", err)
	}
	dates, err := s.q.ImeDates(ctx)
	if err != nil {
		return nil, fmt.Errorf("ime dates: %w", err)
	}
	out := AdminListAuctions200JSONResponse{Items: make([]AdminOffering, 0, len(rows)), Dates: make([]openapi_types.Date, 0, len(dates))}
	for _, d := range dates {
		out.Dates = append(out.Dates, openapi_types.Date{Time: d.Time})
	}
	for _, r := range rows {
		out.Items = append(out.Items, AdminOffering{
			Id: r.ID.Bytes, TradeDate: openapi_types.Date{Time: r.TradeDate.Time}, Metal: r.MetalSlug,
			ProductFa: r.ProductFa, ProductEn: textp(r.ProductEn), ProducerFa: r.ProducerFa, ProducerEn: textp(r.ProducerEn),
			OfferedKg: r.OfferedKg, BasePriceRial: r.BasePriceRial, DemandKg: i64p(r.DemandKg), TradedKg: i64p(r.TradedKg),
			ClearingPriceRial: i64p(r.ClearingPriceRial), Source: AdminOfferingSource(r.Source), UpdatedAt: r.UpdatedAt.Time.UTC(),
		})
	}
	return out, nil
}

// AdminBulkAuctions validates and upserts offerings (all-or-nothing when any row is invalid).
func (s *Server) AdminBulkAuctions(ctx context.Context, req AdminBulkAuctionsRequestObject) (AdminBulkAuctionsResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminBulkAuctionsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows := req.Body.Rows
	if len(rows) == 0 || len(rows) > 300 {
		return fail[AdminBulkAuctionsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "1–300 rows")), nil
	}
	metals, err := s.q.ListMetals(ctx)
	if err != nil {
		return nil, fmt.Errorf("metals: %w", err)
	}
	known := map[string]bool{}
	for _, m := range metals {
		known[m.Slug] = true
	}
	out := AdminBulkAuctions200JSONResponse{}
	params := make([]dbq.UpsertImeOfferingParams, 0, len(rows))
	invalid := false
	for i, r := range rows {
		res := struct {
			Error    *string `json:"error,omitempty"`
			Index    int     `json:"index"`
			Inserted *bool   `json:"inserted,omitempty"`
			Ok       bool    `json:"ok"`
		}{Index: i, Ok: true}
		product, ok1 := content.Clean(r.ProductFa, 2, 200)
		producer, ok2 := content.Clean(r.ProducerFa, 2, 200)
		var msg string
		switch {
		case !known[r.Metal]:
			msg = "unknown metal"
		case !ok1 || !ok2:
			msg = "product and producer are required (2–200 characters)"
		default:
			if err := auctions.Validate(auctions.Offering{OfferedKg: r.OfferedKg, BasePriceRial: r.BasePriceRial, DemandKg: r.DemandKg, TradedKg: r.TradedKg, ClearingPriceRial: r.ClearingPriceRial}); err != nil {
				msg = err.Error()
			}
		}
		if msg != "" {
			res.Ok, res.Error, invalid = false, &msg, true
		}
		out.Results = append(out.Results, res)
		params = append(params, dbq.UpsertImeOfferingParams{
			TradeDate: pgtype.Date{Time: r.TradeDate.Time, Valid: true}, MetalSlug: r.Metal, ProductFa: product, ProductEn: optText(r.ProductEn),
			ProducerFa: producer, ProducerEn: optText(r.ProducerEn), OfferedKg: r.OfferedKg, BasePriceRial: r.BasePriceRial,
			DemandKg: i64n(r.DemandKg), TradedKg: i64n(r.TradedKg), ClearingPriceRial: i64n(r.ClearingPriceRial), Source: "manual", EnteredBy: p.ID,
		})
	}
	if invalid || (req.Body.DryRun != nil && *req.Body.DryRun) {
		return out, nil
	}
	err = s.tx(ctx, func(q *dbq.Queries) error {
		for i, arg := range params {
			row, err := q.UpsertImeOffering(ctx, arg)
			if err != nil {
				return fmt.Errorf("row %d: %w", i, err)
			}
			ins := row.Inserted
			out.Results[i].Inserted = &ins
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "ime.bulk", Entity: "ime_offering", Data: map[string]int{"rows": len(params)}})
	})
	if err != nil {
		return nil, fmt.Errorf("save offerings: %w", err)
	}
	out.Saved = len(params)
	return out, nil
}

// AdminDeleteAuction deletes one offering.
func (s *Server) AdminDeleteAuction(ctx context.Context, req AdminDeleteAuctionRequestObject) (AdminDeleteAuctionResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminDeleteAuctiondefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	err := s.tx(ctx, func(q *dbq.Queries) error {
		row, err := q.DeleteImeOffering(ctx, id)
		if err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "ime.delete", Entity: "ime_offering", EntityID: *uuidString(id),
			Data: map[string]string{"date": row.TradeDate.Time.Format(time.DateOnly), "product": row.ProductFa, "producer": row.ProducerFa}})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminDeleteAuctiondefaultApplicationProblemPlusJSONResponse](notFound(ctx, "offering")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("delete offering: %w", err)
	}
	return AdminDeleteAuction204Response{}, nil
}

// --- helpers --------------------------------------------------------------------------

// featureLock reports whether tier t lacks f, and the plan that unlocks it.
func featureLock(t access.Tier, f access.Feature) (bool, *Tier) {
	if access.Allowed(t, f) {
		return false, nil
	}
	if need, ok := access.RequiredTier(f); ok {
		plan := Tier(need)
		return true, &plan
	}
	return true, nil
}

func i64p(v pgtype.Int8) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

func i64n(v *int64) pgtype.Int8 {
	if v == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *v, Valid: true}
}

func isNotNullViolation(err error) bool {
	var pg interface{ SQLState() string }
	return errors.As(err, &pg) && pg.SQLState() == "23502"
}
