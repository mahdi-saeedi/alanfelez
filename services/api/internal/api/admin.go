package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// Who may do what in /v1/admin (SECURITY §6: manual prices are editor/admin only).
var (
	rolesRead        = []string{auth.RoleStaff}
	rolesPriceWrite  = []string{auth.RoleEditor, auth.RoleAdmin}
	rolesGrantAccess = []string{auth.RoleAdmin}
)

// AdminListSeries lists every series with its latest price.
func (s *Server) AdminListSeries(ctx context.Context, _ AdminListSeriesRequestObject) (AdminListSeriesResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return adminListSeriesProblem(*pr), nil
	}
	rows, err := s.q.ListLatestPrices(ctx, true)
	if err != nil {
		return nil, fmt.Errorf("admin list series: %w", err)
	}
	out := make([]AdminSeries, 0, len(rows))
	for _, r := range rows {
		a := AdminSeries{
			Slug: r.Slug, ProductFa: r.ProductFa, ProductEn: textp(r.ProductEn), Metal: &r.MetalSlug, Market: r.MarketSlug,
			Currency: Currency(r.Currency), Unit: Unit(r.Unit), IsBase: r.IsBase, Active: r.Active, MaxJumpBp: int(r.MaxJumpBp),
			LatestAt: timep(r.ObservedAt), LatestSource: textp(r.SourceSlug),
		}
		if r.PriceMinor.Valid {
			a.LatestAmount = strp(i64s(r.PriceMinor.Int64))
		}
		out = append(out, a)
	}
	return AdminListSeries200JSONResponse{Items: out}, nil
}

// AdminCreatePrice stores one manual price.
func (s *Server) AdminCreatePrice(ctx context.Context, req AdminCreatePriceRequestObject) (AdminCreatePriceResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminCreatePrice401ApplicationProblemPlusJSONResponse(*pr), nil
		}
		return AdminCreatePrice403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	quote, msg := s.quoteOf(*req.Body)
	if msg != "" {
		return AdminCreatePrice400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, msg))}, nil
	}
	srcID, err := s.manualSourceID(ctx)
	if err != nil {
		return nil, err
	}
	actor := actorOf(ctx, p)
	res, err := s.prices.Ingest(ctx, prices.Origin{SourceID: srcID, Manual: true, Actor: &actor},
		[]prices.Quote{quote}, prices.IngestOptions{Publish: true})
	if err != nil {
		return nil, err
	}
	r := res[0]
	switch r.Outcome {
	case prices.Stored:
		return AdminCreatePrice201JSONResponse(adminPointOf(r, quote, p)), nil
	case prices.Jump:
		pb := problem(ctx, http.StatusUnprocessableEntity, codePriceJump, "Price jump needs confirmation", r.Message)
		return AdminCreatePrice422ApplicationProblemPlusJSONResponse(pb), nil
	case prices.Duplicate:
		return AdminCreatePrice409ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusConflict, codeConflict, "Duplicate point", r.Message)), nil
	case prices.Invalid:
		if r.Message == "unknown series" {
			return AdminCreatePrice404ApplicationProblemPlusJSONResponse(notFound(ctx, "series")), nil
		}
		return AdminCreatePrice400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, r.Message))}, nil
	default:
		return nil, fmt.Errorf("unexpected outcome %q", r.Outcome)
	}
}

// AdminBulkPrices validates (dry run) or stores many manual prices.
func (s *Server) AdminBulkPrices(ctx context.Context, req AdminBulkPricesRequestObject) (AdminBulkPricesResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminBulkPrices401ApplicationProblemPlusJSONResponse(*pr), nil
		}
		return AdminBulkPrices403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	items := req.Body.Items
	if len(items) == 0 || len(items) > 500 {
		return AdminBulkPrices400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, "1 to 500 items"))}, nil
	}
	srcID, err := s.manualSourceID(ctx)
	if err != nil {
		return nil, err
	}
	out := AdminBulkPrices200JSONResponse{Items: make([]BulkPriceResult, len(items))}
	// Rows that don't parse are reported without reaching the service; the rest keep their input index.
	var quotes []prices.Quote
	var index []int
	for i, it := range items {
		out.Items[i] = BulkPriceResult{Index: i, Series: it.Series}
		q, msg := s.quoteOf(it)
		if msg != "" {
			out.Items[i].Status, out.Items[i].Message = BulkPriceResultStatusInvalid, &msg
			continue
		}
		quotes, index = append(quotes, q), append(index, i)
	}
	if len(quotes) > 0 {
		actor := actorOf(ctx, p)
		dry := req.Body.DryRun != nil && *req.Body.DryRun
		res, err := s.prices.Ingest(ctx, prices.Origin{SourceID: srcID, Manual: true, Actor: &actor},
			quotes, prices.IngestOptions{DryRun: dry, Publish: true})
		if err != nil {
			return nil, err
		}
		for k, r := range res {
			b := &out.Items[index[k]]
			b.Status = bulkStatus(r.Outcome)
			if r.Message != "" {
				b.Message = strp(r.Message)
			}
			if r.Previous != nil {
				b.PreviousAmount = strp(i64s(*r.Previous))
				jb := int(r.JumpBp)
				b.JumpBp = &jb
			}
			if r.Outcome == prices.Stored {
				out.Stored++
			}
		}
	}
	return out, nil
}

func bulkStatus(o prices.Outcome) BulkPriceResultStatus {
	switch o {
	case prices.Stored:
		return BulkPriceResultStatusStored
	case prices.OK:
		return BulkPriceResultStatusOk
	case prices.Jump, prices.Quarantined:
		return BulkPriceResultStatusJump
	case prices.Duplicate:
		return BulkPriceResultStatusDuplicate
	default:
		return BulkPriceResultStatusInvalid
	}
}

// AdminListQuarantine lists points held back by the outlier gate.
func (s *Server) AdminListQuarantine(ctx context.Context, _ AdminListQuarantineRequestObject) (AdminListQuarantineResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminListQuarantine401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(*pr)}, nil
		}
		return AdminListQuarantine403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	rows, err := s.q.ListQuarantined(ctx)
	if err != nil {
		return nil, fmt.Errorf("list quarantined: %w", err)
	}
	out := make([]AdminPoint, 0, len(rows))
	for _, r := range rows {
		a := AdminPoint{
			Id: i64s(r.ID), Series: r.SeriesSlug, Amount: i64s(r.PriceMinor), ObservedAt: r.ObservedAt.Time.UTC(),
			Status: AdminPointStatus(r.Status), IsManual: r.IsManual, Source: r.SourceSlug, EnteredBy: uuidString(r.EnteredBy),
			CreatedAt: r.CreatedAt.Time.UTC(),
		}
		if r.LatestMinor.Valid {
			a.PreviousAmount = strp(i64s(r.LatestMinor.Int64))
			jb := int(prices.JumpBp(r.LatestMinor.Int64, r.PriceMinor))
			a.JumpBp = &jb
		}
		out = append(out, a)
	}
	return AdminListQuarantine200JSONResponse{Items: out}, nil
}

// AdminReviewPrice approves or rejects a quarantined point.
func (s *Server) AdminReviewPrice(ctx context.Context, req AdminReviewPriceRequestObject) (AdminReviewPriceResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminReviewPrice401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(*pr)}, nil
		}
		return AdminReviewPrice403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	id, err := strconv.ParseInt(req.Id, 10, 64)
	if err != nil {
		return AdminReviewPrice404ApplicationProblemPlusJSONResponse(notFound(ctx, "point")), nil
	}
	rp, err := s.prices.Review(ctx, id, req.Body.Decision == AdminReviewPriceJSONBodyDecisionApprove, actorOf(ctx, p))
	switch {
	case errors.Is(err, prices.ErrNotFound):
		return AdminReviewPrice404ApplicationProblemPlusJSONResponse(notFound(ctx, "point")), nil
	case errors.Is(err, prices.ErrConflict):
		return AdminReviewPrice409ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusConflict, codeConflict, "Already reviewed", err.Error())), nil
	case err != nil:
		return nil, err
	}
	return AdminReviewPrice200JSONResponse{
		Id: i64s(rp.ID), Series: rp.SeriesSlug, Amount: i64s(rp.PriceMinor), ObservedAt: rp.ObservedAt.Time.UTC(),
		Status: AdminPointStatus(rp.Status), IsManual: rp.IsManual, Source: rp.SourceSlug, EnteredBy: uuidString(rp.EnteredBy),
		CreatedAt: rp.CreatedAt.Time.UTC(),
	}, nil
}

// AdminListSources reports source health for the admin dashboard.
func (s *Server) AdminListSources(ctx context.Context, _ AdminListSourcesRequestObject) (AdminListSourcesResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminListSources401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(*pr)}, nil
		}
		return AdminListSources403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	rows, err := s.q.SourceHealth(ctx)
	if err != nil {
		return nil, fmt.Errorf("source health: %w", err)
	}
	now := s.now()
	out := make([]SourceHealth, 0, len(rows))
	for _, r := range rows {
		interval := int(r.FetchIntervalS)
		h := SourceHealth{
			Slug: r.Slug, Name: r.NameFa, Provider: r.Provider, Active: r.Active,
			FetchIntervalSeconds: &interval, StaleAfterSeconds: int(r.StaleAfterS),
			LastRunAt: timep(r.LastRunAt), LastError: textp(r.LastError),
			LastSuccessAt: timep(r.LastSuccessAt), LastPointAt: timep(r.LastPointAt),
		}
		if r.LastRunStatus != "" {
			st := SourceHealthLastRunStatus(r.LastRunStatus)
			h.LastRunStatus = &st
		}
		staleAfter := time.Duration(r.StaleAfterS) * time.Second
		h.Stale = r.Active && (!r.LastPointAt.Valid || now.Sub(r.LastPointAt.Time) > staleAfter)
		out = append(out, h)
	}
	return AdminListSources200JSONResponse{Items: out}, nil
}

// AdminListSubscriptions lists the latest subscriptions.
func (s *Server) AdminListSubscriptions(ctx context.Context, req AdminListSubscriptionsRequestObject) (AdminListSubscriptionsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminListSubscriptions401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(*pr)}, nil
		}
		return AdminListSubscriptions403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	var uid pgtype.UUID
	if req.Params.UserId != nil {
		uid = pgtype.UUID{Bytes: *req.Params.UserId, Valid: true}
	}
	rows, err := s.q.ListSubscriptions(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("list subscriptions: %w", err)
	}
	out := make([]Subscription, 0, len(rows))
	for _, r := range rows {
		out = append(out, subscriptionOf(dbq.InsertSubscriptionRow(r)))
	}
	return AdminListSubscriptions200JSONResponse{Items: out}, nil
}

// AdminGrantSubscription grants a plan manually (until checkout exists).
func (s *Server) AdminGrantSubscription(ctx context.Context, req AdminGrantSubscriptionRequestObject) (AdminGrantSubscriptionResponseObject, error) {
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminGrantSubscription401ApplicationProblemPlusJSONResponse(*pr), nil
		}
		return AdminGrantSubscription403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	b := req.Body
	if b.Days < 1 || b.Days > 1095 {
		return AdminGrantSubscription400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, "days must be 1–1095"))}, nil
	}
	if b.Plan != PaidPlanSilver && b.Plan != PaidPlanGold {
		return AdminGrantSubscription400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, "unknown plan"))}, nil
	}
	note := ""
	if b.Note != nil {
		note = *b.Note
	}
	row, err := s.billing.Grant(ctx, actorOf(ctx, p), pgtype.UUID{Bytes: b.UserId, Valid: true}, access.Tier(b.Plan), b.Days, note)
	if err != nil {
		return nil, err
	}
	return AdminGrantSubscription201JSONResponse(subscriptionOf(row)), nil
}

func subscriptionOf(r dbq.InsertSubscriptionRow) Subscription {
	return Subscription{
		Id: uuid.UUID(r.ID.Bytes), UserId: uuid.UUID(r.UserID.Bytes), Plan: PaidPlan(r.PlanCode),
		StartsAt: r.StartsAt.Time.UTC(), EndsAt: r.EndsAt.Time.UTC(),
		Status: SubscriptionStatus(r.Status), Origin: SubscriptionOrigin(r.Origin), Note: textp(r.Note),
	}
}

// quoteOf validates a manual input. observedAt defaults to now.
func (s *Server) quoteOf(in ManualPriceInput) (prices.Quote, string) {
	amount, ok := parseAmount(in.Amount)
	if !ok {
		return prices.Quote{}, "amount must be a positive integer (minor units)"
	}
	if in.Series == "" {
		return prices.Quote{}, "series is required"
	}
	at := s.now()
	if in.ObservedAt != nil {
		at = *in.ObservedAt
	}
	force := in.Force != nil && *in.Force
	return prices.Quote{Series: in.Series, ObservedAt: at.UTC().Truncate(time.Second), Price: amount, Force: force}, ""
}

func (s *Server) manualSourceID(ctx context.Context) (int16, error) {
	src, err := s.q.GetSourceBySlug(ctx, "manual")
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errors.New("manual source is missing (seed config/seed/reference/40-prices.yaml)")
	}
	if err != nil {
		return 0, fmt.Errorf("manual source: %w", err)
	}
	return src.ID, nil
}

func adminPointOf(r prices.Result, q prices.Quote, p *auth.Principal) AdminPoint {
	a := AdminPoint{
		Id: i64s(r.PointID), Series: q.Series, Amount: i64s(q.Price), ObservedAt: q.ObservedAt,
		Status: AdminPointStatusPublished, IsManual: true, Source: "manual", EnteredBy: uuidString(p.ID), CreatedAt: time.Now().UTC(),
	}
	if r.Previous != nil {
		a.PreviousAmount = strp(i64s(*r.Previous))
		jb := int(r.JumpBp)
		a.JumpBp = &jb
	}
	return a
}

func adminListSeriesProblem(p Problem) AdminListSeriesResponseObject {
	if p.Status == http.StatusUnauthorized {
		return AdminListSeries401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(p)}
	}
	return AdminListSeries403ApplicationProblemPlusJSONResponse(p)
}
