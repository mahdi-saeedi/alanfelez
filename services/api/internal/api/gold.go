package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/alerts"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/calculator"
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Limits for saved things (🛠 SCOPE §17).
const maxCalculations = 50

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

func isNotNullViolation(err error) bool {
	var pg interface{ SQLState() string }
	return errors.As(err, &pg) && pg.SQLState() == "23502"
}

// --- price SMS settings (Gold, client 2026-10-27) -------------------------------------

// GetMySmsSettings returns the user's main metal for the automatic price SMS (internal/alerts.Auto).
func (s *Server) GetMySmsSettings(ctx context.Context, _ GetMySmsSettingsRequestObject) (GetMySmsSettingsResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[GetMySmsSettingsdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	out, err := s.smsSettings(ctx, p)
	if err != nil {
		return nil, err
	}
	return GetMySmsSettings200JSONResponse(out), nil
}

// SetMySmsSettings chooses the main metal and turns the price SMS on or off (Gold).
func (s *Server) SetMySmsSettings(ctx context.Context, req SetMySmsSettingsRequestObject) (SetMySmsSettingsResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[SetMySmsSettingsdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	if !access.Allowed(cur.Tier, access.AlertsSMS) {
		return fail[SetMySmsSettingsdefaultApplicationProblemPlusJSONResponse](lockedProblem(ctx, access.AlertsSMS)), nil
	}
	if _, err := s.touchUser(ctx, p); err != nil { // the prefs row needs the account row
		return nil, err
	}
	n, err := s.q.UpsertSmsPrefs(ctx, dbq.UpsertSmsPrefsParams{UserID: p.ID, MetalSlug: req.Body.Metal, Enabled: req.Body.Enabled})
	if err != nil {
		return nil, fmt.Errorf("save sms settings: %w", err)
	}
	if n == 0 {
		return fail[SetMySmsSettingsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown metal")), nil
	}
	out, err := s.smsSettings(ctx, p)
	if err != nil {
		return nil, err
	}
	return SetMySmsSettings200JSONResponse(out), nil
}

func (s *Server) smsSettings(ctx context.Context, p *auth.Principal) (SmsSettings, error) {
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return SmsSettings{}, err //nolint:wrapcheck // tier lookups say what failed
	}
	out := SmsSettings{Allowed: access.Allowed(cur.Tier, access.AlertsSMS), Enabled: true}
	if ph := phoneOf(p.Username); ph != "" {
		out.Phone = &ph
	}
	row, err := s.q.GetSmsPrefs(ctx, p.ID)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return SmsSettings{}, fmt.Errorf("sms settings: %w", err)
	default:
		out.Metal, out.Enabled = textp(row.MetalSlug), row.Enabled
	}
	return out, nil
}
