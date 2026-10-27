package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/billing"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/payment"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/jalali"
)

// Problem codes for billing (API_GUIDELINES §4).
const (
	codePaymentsDisabled = "PAYMENTS_DISABLED"
	codeNotRefundable    = "NOT_REFUNDABLE"
	codeUpstream         = "UPSTREAM_UNAVAILABLE"
)

var iranMobile = regexp.MustCompile(`^09\d{9}$`)

// touchUser refreshes the local profile from the token (Keycloak stays the owner of identities).
func (s *Server) touchUser(ctx context.Context, p *auth.Principal) (dbq.UpsertUserRow, error) {
	var phone pgtype.Text
	if e164 := phoneOf(p.Username); e164 != "" {
		phone = pgtype.Text{String: e164, Valid: true}
	}
	u, err := s.q.UpsertUser(ctx, dbq.UpsertUserParams{
		ID: p.ID, Username: p.Username, PhoneE164: phone,
		FirstName: textOf(p.GivenName), LastName: textOf(p.FamilyName), Email: textOf(p.Email),
	})
	if err != nil {
		return dbq.UpsertUserRow{}, fmt.Errorf("upsert user: %w", err)
	}
	return u, nil
}

// phoneOf is the account's mobile in E.164: the username is the mobile (09…) for everyone who signed up on the site.
// Other usernames (staff, old test accounts) have none, so no SMS can reach them.
func phoneOf(username string) string {
	if iranMobile.MatchString(username) {
		return "+98" + username[1:]
	}
	return ""
}

func unauthenticated(ctx context.Context) Problem {
	return problem(ctx, http.StatusUnauthorized, codeUnauthenticated, "Authentication required", "")
}

// GetMe returns the profile and the current / next subscription.
func (s *Server) GetMe(ctx context.Context, _ GetMeRequestObject) (GetMeResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return GetMe401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(unauthenticated(ctx))}, nil
	}
	u, err := s.touchUser(ctx, p)
	if err != nil {
		return nil, err
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	me := Me{
		Id: uuid.UUID(u.ID.Bytes), Username: u.Username, Tier: Tier(cur.Tier),
		Phone: textp(u.PhoneE164), FirstName: textp(u.FirstName), LastName: textp(u.LastName), Email: textp(u.Email),
	}
	subs, err := s.q.ListUserSubscriptions(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("list subscriptions: %w", err)
	}
	now := s.now()
	for i := range subs {
		sub := subs[i]
		if sub.Status != "active" || !sub.EndsAt.Time.After(now) {
			continue
		}
		ms := mySubscription(sub)
		switch {
		case cur.SubscriptionID.Valid && sub.ID == cur.SubscriptionID:
			me.Current = &ms
		case sub.StartsAt.Time.After(now) && (me.Next == nil || sub.StartsAt.Time.Before(me.Next.StartsAt)):
			me.Next = &ms
		}
	}
	return GetMe200JSONResponse(me), nil
}

// ListMySubscriptions returns the user's subscription history.
func (s *Server) ListMySubscriptions(ctx context.Context, _ ListMySubscriptionsRequestObject) (ListMySubscriptionsResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return ListMySubscriptions401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(unauthenticated(ctx))}, nil
	}
	rows, err := s.q.ListUserSubscriptions(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("list subscriptions: %w", err)
	}
	out := make([]MySubscription, 0, len(rows))
	for _, r := range rows {
		out = append(out, mySubscription(r))
	}
	return ListMySubscriptions200JSONResponse{Items: out}, nil
}

// ListMyOrders returns the billing history.
func (s *Server) ListMyOrders(ctx context.Context, _ ListMyOrdersRequestObject) (ListMyOrdersResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return ListMyOrders401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(unauthenticated(ctx))}, nil
	}
	rows, err := s.q.ListUserOrders(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("list orders: %w", err)
	}
	out := make([]Order, 0, len(rows))
	for _, r := range rows {
		o, err := s.orderOf(ctx, orderRowOf(r), r.RefID, r.RefundStatus)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return ListMyOrders200JSONResponse{Items: out}, nil
}

// GetMyOrder returns one of the user's orders (others' orders are "not found").
func (s *Server) GetMyOrder(ctx context.Context, req GetMyOrderRequestObject) (GetMyOrderResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return GetMyOrder401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(unauthenticated(ctx))}, nil
	}
	rows, err := s.q.ListUserOrders(ctx, p.ID)
	if err != nil {
		return nil, fmt.Errorf("list orders: %w", err)
	}
	for _, r := range rows {
		if uuid.UUID(r.ID.Bytes) == req.Id {
			o, err := s.orderOf(ctx, orderRowOf(r), r.RefID, r.RefundStatus)
			if err != nil {
				return nil, err
			}
			return GetMyOrder200JSONResponse(o), nil
		}
	}
	return GetMyOrder404ApplicationProblemPlusJSONResponse(notFound(ctx, "order")), nil
}

// RequestRefund files a refund request.
func (s *Server) RequestRefund(ctx context.Context, req RequestRefundRequestObject) (RequestRefundResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return RequestRefund401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(unauthenticated(ctx))}, nil
	}
	reason := ""
	if req.Body != nil && req.Body.Reason != nil {
		reason = *req.Body.Reason
	}
	r, err := s.billing.RequestRefund(ctx, p.ID, pgtype.UUID{Bytes: req.Id, Valid: true}, reason)
	switch {
	case errors.Is(err, billing.ErrNotFound):
		return RequestRefund404ApplicationProblemPlusJSONResponse(notFound(ctx, "order")), nil
	case errors.Is(err, billing.ErrConflict):
		return RequestRefund409ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusConflict, codeConflict, "Refund already requested", "")), nil
	case errors.Is(err, billing.ErrNotRefundable):
		return RequestRefund409ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusConflict, codeNotRefundable, "Not refundable",
			"refunds are possible within 7 days of payment if no paid feature was used")), nil
	case err != nil:
		return nil, err
	}
	return RequestRefund201JSONResponse(refundOf(r)), nil
}

// QuoteCheckout prices a purchase.
func (s *Server) QuoteCheckout(ctx context.Context, req QuoteCheckoutRequestObject) (QuoteCheckoutResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return QuoteCheckout401ApplicationProblemPlusJSONResponse(unauthenticated(ctx)), nil
	}
	q, err := s.billing.Quote(ctx, p.ID, access.Tier(req.Body.Plan), billing.Period(req.Body.Period))
	switch {
	case errors.Is(err, billing.ErrNotFound):
		return QuoteCheckout404ApplicationProblemPlusJSONResponse(notFound(ctx, "plan price")), nil
	case errors.Is(err, billing.ErrFreePlan), errors.Is(err, billing.ErrUnknownPeriod):
		return QuoteCheckout400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, err.Error()))}, nil
	case err != nil:
		return nil, err
	}
	return QuoteCheckout200JSONResponse{
		Plan: req.Body.Plan, Period: req.Body.Period, Kind: CheckoutQuoteKind(q.Kind),
		Price: rial(q.Price), Credit: rial(q.Credit), Amount: rial(q.Amount),
		StartsAt: q.Starts.UTC(), EndsAt: q.Ends.UTC(),
	}, nil
}

// StartCheckout creates the order and returns the gateway page.
func (s *Server) StartCheckout(ctx context.Context, req StartCheckoutRequestObject) (StartCheckoutResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return StartCheckout401ApplicationProblemPlusJSONResponse(unauthenticated(ctx)), nil
	}
	key := strings.TrimSpace(req.Params.IdempotencyKey)
	if len(key) < 8 || len(key) > 100 {
		return StartCheckout400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, "Idempotency-Key must be 8–100 characters"))}, nil
	}
	u, err := s.touchUser(ctx, p)
	if err != nil {
		return nil, err
	}
	locale := "fa"
	if req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en" {
		locale = "en"
	}
	co, err := s.billing.StartCheckout(ctx, u, access.Tier(req.Body.Plan), billing.Period(req.Body.Period), key, locale)
	switch {
	case errors.Is(err, billing.ErrPaymentsDisabled):
		return StartCheckout409ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusConflict, codePaymentsDisabled, "Payments are not enabled yet", "")), nil
	case errors.Is(err, billing.ErrBlocked):
		return StartCheckout403ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusForbidden, codeForbidden, "Account blocked", "")), nil
	case errors.Is(err, billing.ErrNotFound):
		return StartCheckout404ApplicationProblemPlusJSONResponse(notFound(ctx, "plan price")), nil
	case errors.Is(err, billing.ErrFreePlan), errors.Is(err, billing.ErrUnknownPeriod):
		return StartCheckout400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, err.Error()))}, nil
	case errors.Is(err, payment.ErrUnavailable):
		return StartCheckout503ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusServiceUnavailable, codeUpstream, "Payment gateway unavailable", "")), nil
	case err != nil:
		return nil, err
	}
	o, err := s.orderOf(ctx, co.Order, pgtype.Text{}, pgtype.Text{})
	if err != nil {
		return nil, err
	}
	res := CheckoutResult{Order: o}
	if co.RedirectURL != "" {
		res.RedirectUrl = &co.RedirectURL
	}
	return StartCheckout201JSONResponse(res), nil
}

// VerifyPayment completes a payment after the gateway callback (public, idempotent).
func (s *Server) VerifyPayment(ctx context.Context, req VerifyPaymentRequestObject) (VerifyPaymentResponseObject, error) {
	o, err := s.billing.Verify(ctx, pgtype.UUID{Bytes: req.Body.OrderId, Valid: true}, req.Body.Params)
	switch {
	case errors.Is(err, billing.ErrNotFound):
		return VerifyPayment404ApplicationProblemPlusJSONResponse(notFound(ctx, "order")), nil
	case errors.Is(err, billing.ErrMismatch):
		return VerifyPayment400ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(badRequest(ctx, "payment does not match the order"))}, nil
	case errors.Is(err, payment.ErrUnavailable):
		return VerifyPayment503ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusServiceUnavailable, codeUpstream, "Payment gateway unavailable, try again", "")), nil
	case err != nil:
		return nil, err
	}
	return VerifyPayment200JSONResponse{OrderId: req.Body.OrderId, Status: OrderStatus(o.Status)}, nil
}

// AdminListUsers searches users.
func (s *Server) AdminListUsers(ctx context.Context, req AdminListUsersRequestObject) (AdminListUsersResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminListUsers401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(*pr)}, nil
		}
		return AdminListUsers403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	q := ""
	if req.Params.Q != nil {
		q = normalizeSearch(*req.Params.Q)
	}
	rows, err := s.q.SearchUsers(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	out := make([]AdminUser, 0, len(rows))
	for _, r := range rows {
		out = append(out, AdminUser{
			Id: uuid.UUID(r.ID.Bytes), Username: r.Username, Phone: textp(r.PhoneE164), FirstName: textp(r.FirstName),
			LastName: textp(r.LastName), Email: textp(r.Email), CreatedAt: r.CreatedAt.Time.UTC(), LastSeenAt: r.LastSeenAt.Time.UTC(),
			Blocked: r.BlockedAt.Valid, CurrentPlan: Tier(r.CurrentPlan), CurrentEndsAt: timep(r.CurrentEndsAt),
		})
	}
	return AdminListUsers200JSONResponse{Items: out}, nil
}

// AdminListOrders lists orders for staff.
func (s *Server) AdminListOrders(ctx context.Context, req AdminListOrdersRequestObject) (AdminListOrdersResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminListOrders401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(*pr)}, nil
		}
		return AdminListOrders403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	var params dbq.AdminListOrdersParams
	if req.Params.Status != nil {
		params.Status = pgtype.Text{String: string(*req.Params.Status), Valid: true}
	}
	if req.Params.RefundStatus != nil {
		params.RefundStatus = pgtype.Text{String: string(*req.Params.RefundStatus), Valid: true}
	}
	if req.Params.UserId != nil {
		params.UserID = pgtype.UUID{Bytes: *req.Params.UserId, Valid: true}
	}
	rows, err := s.q.AdminListOrders(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("admin list orders: %w", err)
	}
	out := make([]AdminOrder, 0, len(rows))
	for _, r := range rows {
		a := AdminOrder{
			Id: uuid.UUID(r.ID.Bytes), UserId: uuid.UUID(r.UserID.Bytes), Username: textp(r.Username),
			Plan: PaidPlan(r.PlanCode), Period: BillingPeriod(r.Period), Kind: AdminOrderKind(r.Kind),
			Price: rial(r.PriceRial), Credit: rial(r.CreditRial), Amount: rial(r.AmountRial), Status: OrderStatus(r.Status),
			CreatedAt: r.CreatedAt.Time.UTC(), PaidAt: timep(r.PaidAt), Gateway: r.Gateway, RefId: textp(r.RefID),
			RefundReason: textp(r.RefundReason),
		}
		if r.RefundID.Valid {
			id := uuid.UUID(r.RefundID.Bytes)
			a.RefundId = &id
		}
		if r.RefundStatus.Valid {
			rs := RefundStatus(r.RefundStatus.String)
			a.RefundStatus = &rs
		}
		out = append(out, a)
	}
	return AdminListOrders200JSONResponse{Items: out}, nil
}

// AdminDecideRefund approves or rejects a refund (admin only).
func (s *Server) AdminDecideRefund(ctx context.Context, req AdminDecideRefundRequestObject) (AdminDecideRefundResponseObject, error) {
	p, pr := requireRoles(ctx, rolesGrantAccess...)
	if pr != nil {
		if pr.Status == http.StatusUnauthorized {
			return AdminDecideRefund401ApplicationProblemPlusJSONResponse{ProblemApplicationProblemPlusJSONResponse(*pr)}, nil
		}
		return AdminDecideRefund403ApplicationProblemPlusJSONResponse(*pr), nil
	}
	note := ""
	if req.Body.Note != nil {
		note = *req.Body.Note
	}
	r, err := s.billing.DecideRefund(ctx, actorOf(ctx, p), pgtype.UUID{Bytes: req.Id, Valid: true},
		req.Body.Decision == AdminDecideRefundJSONBodyDecisionApprove, note)
	switch {
	case errors.Is(err, billing.ErrNotFound):
		return AdminDecideRefund404ApplicationProblemPlusJSONResponse(notFound(ctx, "refund")), nil
	case errors.Is(err, billing.ErrConflict):
		return AdminDecideRefund409ApplicationProblemPlusJSONResponse(problem(ctx, http.StatusConflict, codeConflict, "Already decided", "")), nil
	case err != nil:
		return nil, err
	}
	return AdminDecideRefund200JSONResponse(refundOf(r)), nil
}

// orderRowOf converts a list row back to the order columns.
func orderRowOf(r dbq.ListUserOrdersRow) dbq.AppOrder {
	return dbq.AppOrder{
		ID: r.ID, UserID: r.UserID, PlanPriceID: r.PlanPriceID, PlanCode: r.PlanCode, Period: r.Period, Kind: r.Kind,
		PriceRial: r.PriceRial, CreditRial: r.CreditRial, AmountRial: r.AmountRial, StartsAt: r.StartsAt, Status: r.Status,
		IdempotencyKey: r.IdempotencyKey, Locale: r.Locale, ExpiresAt: r.ExpiresAt, PaidAt: r.PaidAt, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func (s *Server) orderOf(ctx context.Context, o dbq.AppOrder, refID, refundStatus pgtype.Text) (Order, error) {
	out := Order{
		Id: uuid.UUID(o.ID.Bytes), Plan: PaidPlan(o.PlanCode), Period: BillingPeriod(o.Period), Kind: OrderKind(o.Kind),
		Price: rial(o.PriceRial), Credit: rial(o.CreditRial), Amount: rial(o.AmountRial), Status: OrderStatus(o.Status),
		CreatedAt: o.CreatedAt.Time.UTC(), PaidAt: timep(o.PaidAt), RefId: textp(refID),
	}
	if refundStatus.Valid {
		rs := RefundStatus(refundStatus.String)
		out.RefundStatus = &rs
	} else if o.Status == billing.OrderPaid {
		ok, err := s.billing.Refundable(ctx, o)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Order{}, err
		}
		out.Refundable = ok
	}
	return out, nil
}

func mySubscription(r dbq.ListUserSubscriptionsRow) MySubscription {
	return MySubscription{
		Id: uuid.UUID(r.ID.Bytes), Plan: PaidPlan(r.PlanCode), StartsAt: r.StartsAt.Time.UTC(), EndsAt: r.EndsAt.Time.UTC(),
		Status: MySubscriptionStatus(r.Status), Origin: MySubscriptionOrigin(r.Origin),
	}
}

func refundOf(r dbq.AppRefund) Refund {
	return Refund{
		Id: uuid.UUID(r.ID.Bytes), OrderId: uuid.UUID(r.OrderID.Bytes), Amount: rial(r.AmountRial), Status: RefundStatus(r.Status),
		Reason: textp(r.Reason), Note: textp(r.Note), CreatedAt: r.CreatedAt.Time.UTC(), DecidedAt: timep(r.DecidedAt),
	}
}

func rial(v int64) Money { return Money{Amount: i64s(v), Currency: IRR} }

func textOf(s string) pgtype.Text {
	s = strings.TrimSpace(s)
	return pgtype.Text{String: s, Valid: s != ""}
}

// normalizeSearch turns Persian digits into ASCII and "+98…" into "09…", so staff can paste a number as they see it.
func normalizeSearch(q string) string {
	q = jalali.Latin(strings.TrimSpace(q))
	q = strings.ReplaceAll(q, " ", "")
	if strings.HasPrefix(q, "+98") {
		q = "0" + q[3:]
	}
	return q
}
