package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/payment"
)

// Order statuses (app.orders.status).
const (
	OrderPending  = "pending"
	OrderPaid     = "paid"
	OrderFailed   = "failed"
	OrderExpired  = "expired"
	OrderRefunded = "refunded"
)

// PendingTTL is how long a started payment may take before the order is abandoned.
const PendingTTL = 30 * time.Minute

// Errors mapped to problem codes in internal/api.
var (
	ErrPaymentsDisabled = errors.New("payments are not enabled")
	ErrBlocked          = errors.New("user is blocked")
	ErrNotFound         = errors.New("not found")
	ErrNotRefundable    = errors.New("order is not refundable")
	ErrConflict         = errors.New("conflict")
	ErrMismatch         = errors.New("payment does not belong to this order")
)

// Config wires the service.
type Config struct {
	Pool        *pgxpool.Pool
	Gateway     payment.Gateway
	CallbackURL string // the website's payment callback, e.g. https://alanfelez.ir/checkout/callback
	Log         *slog.Logger
}

// Service runs checkout, verification, refunds and manual grants.
type Service struct {
	pool        *pgxpool.Pool
	gw          payment.Gateway
	callbackURL string
	log         *slog.Logger

	usageSeen sync.Map // subscription id + feature already recorded by this process
}

// NewService returns the billing service.
func NewService(c Config) *Service {
	return &Service{pool: c.Pool, gw: c.Gateway, callbackURL: c.CallbackURL, log: c.Log}
}

// dbNow is the database clock. All billing times come from it: SQL checks "active" with now(), and the API host's
// clock may differ by a few milliseconds (a plan starting "now" must be active immediately).
func dbNow(ctx context.Context, q *dbq.Queries) (time.Time, error) {
	t, err := q.DBNow(ctx)
	if err != nil {
		return time.Time{}, fmt.Errorf("db clock: %w", err)
	}
	return t.Time.UTC(), nil
}

// Priced is a quote for a concrete plan price row.
type Priced struct {
	Quote
	PlanPriceID pgtype.UUID
	Plan        access.Tier
	Period      Period
}

// Quote prices plan/period for the user without creating anything.
func (s *Service) Quote(ctx context.Context, userID pgtype.UUID, plan access.Tier, period Period) (Priced, error) {
	return s.quote(ctx, dbq.New(s.pool), userID, plan, period)
}

func (s *Service) quote(ctx context.Context, q *dbq.Queries, userID pgtype.UUID, plan access.Tier, period Period) (Priced, error) {
	if plan == access.Free || !plan.Valid() {
		return Priced{}, ErrFreePlan
	}
	price, err := q.CurrentPlanPrice(ctx, dbq.CurrentPlanPriceParams{PlanCode: string(plan), Period: string(period)})
	if errors.Is(err, pgx.ErrNoRows) {
		return Priced{}, ErrNotFound
	}
	if err != nil {
		return Priced{}, fmt.Errorf("plan price: %w", err)
	}
	held, err := heldOf(ctx, q, userID)
	if err != nil {
		return Priced{}, err
	}
	now, err := dbNow(ctx, q)
	if err != nil {
		return Priced{}, err
	}
	qt, err := QuoteFor(now, held, plan, period, price.AmountRial)
	if err != nil {
		return Priced{}, err
	}
	return Priced{Quote: qt, PlanPriceID: price.ID, Plan: plan, Period: period}, nil
}

// Checkout is the result of starting a purchase.
type Checkout struct {
	Order       dbq.AppOrder
	RedirectURL string // gateway page; empty when nothing had to be paid (credit covered it) or the order is done
}

// StartCheckout creates (or, for a repeated Idempotency-Key, returns) an order and starts its payment.
func (s *Service) StartCheckout(ctx context.Context, user dbq.UpsertUserRow, plan access.Tier, period Period, idemKey, locale string) (Checkout, error) {
	if user.BlockedAt.Valid {
		return Checkout{}, ErrBlocked
	}
	enabled, err := dbq.New(s.pool).FeatureEnabled(ctx, "payments.enabled")
	if err != nil {
		return Checkout{}, fmt.Errorf("feature flag: %w", err)
	}
	if !enabled {
		return Checkout{}, ErrPaymentsDisabled
	}

	var out Checkout
	var created bool
	err = s.inTx(ctx, func(q *dbq.Queries) error {
		if err := q.LockUserBilling(ctx, user.ID); err != nil {
			return fmt.Errorf("lock: %w", err)
		}
		existing, err := q.FindOrderByKey(ctx, dbq.FindOrderByKeyParams{UserID: user.ID, IdempotencyKey: idemKey})
		switch {
		case err == nil:
			out.Order = existing
			return nil
		case !errors.Is(err, pgx.ErrNoRows):
			return fmt.Errorf("find order: %w", err)
		}
		p, err := s.quote(ctx, q, user.ID, plan, period)
		if err != nil {
			return err
		}
		now, err := dbNow(ctx, q)
		if err != nil {
			return err
		}
		o, err := q.InsertOrder(ctx, dbq.InsertOrderParams{
			UserID: user.ID, PlanPriceID: p.PlanPriceID, PlanCode: string(plan), Period: string(period), Kind: string(p.Kind),
			PriceRial: p.Price, CreditRial: p.Credit, AmountRial: p.Amount, StartsAt: ts(p.Starts),
			IdempotencyKey: idemKey, Locale: locale, ExpiresAt: ts(now.Add(PendingTTL)),
		})
		if err != nil {
			return fmt.Errorf("insert order: %w", err)
		}
		out.Order, created = o, true
		if o.AmountRial == 0 { // fully covered by credit: nothing to pay
			if err := s.fulfil(ctx, q, o); err != nil {
				return err
			}
			out.Order.Status = OrderPaid
		}
		return nil
	})
	if err != nil {
		return Checkout{}, err
	}
	if out.Order.Status != OrderPending {
		return out, nil
	}
	if !created {
		// Repeated request for a pending order: reuse its payment if one was started.
		if url, ok := s.pendingRedirect(ctx, out.Order.ID); ok {
			out.RedirectURL = url
			return out, nil
		}
	}
	url, err := s.startPayment(ctx, out.Order, user)
	if err != nil {
		return Checkout{}, err
	}
	out.RedirectURL = url
	return out, nil
}

func (s *Service) startPayment(ctx context.Context, o dbq.AppOrder, user dbq.UpsertUserRow) (string, error) {
	started, err := s.gw.Request(ctx, payment.Request{
		OrderID:     uid(o.ID),
		AmountRial:  o.AmountRial,
		CallbackURL: s.callbackURL + "?order=" + uid(o.ID),
		Description: fmt.Sprintf("Alan Felez %s (%s)", o.PlanCode, o.Period),
		Mobile:      user.PhoneE164.String,
	})
	if err != nil {
		_ = dbq.New(s.pool).SetOrderStatus(ctx, dbq.SetOrderStatusParams{ID: o.ID, Status: OrderFailed})
		return "", fmt.Errorf("%w: %w", payment.ErrUnavailable, err)
	}
	raw := map[string]any{"request": started.Raw, "redirectUrl": started.RedirectURL}
	if _, err := dbq.New(s.pool).InsertPayment(ctx, dbq.InsertPaymentParams{
		OrderID: o.ID, Gateway: s.gw.Name(), Authority: started.Authority, AmountRial: o.AmountRial, Raw: jsonb(raw),
	}); err != nil {
		return "", fmt.Errorf("insert payment: %w", err)
	}
	return started.RedirectURL, nil
}

// pendingRedirect returns the gateway page of the latest initiated payment of an order.
func (s *Service) pendingRedirect(ctx context.Context, orderID pgtype.UUID) (string, bool) {
	var raw []byte
	err := s.pool.QueryRow(ctx,
		`SELECT raw FROM app.payments WHERE order_id = $1 AND status = 'initiated' ORDER BY created_at DESC LIMIT 1`, orderID).Scan(&raw)
	if err != nil {
		return "", false
	}
	var r struct {
		RedirectURL string `json:"redirectUrl"`
	}
	if json.Unmarshal(raw, &r) != nil || r.RedirectURL == "" {
		return "", false
	}
	return r.RedirectURL, true
}

// Verify handles the gateway callback for an order: it asks the gateway (server-to-server), and on success
// activates the subscription in the same transaction that marks the order paid. Safe to call any number of times.
func (s *Service) Verify(ctx context.Context, orderID pgtype.UUID, query map[string]string) (dbq.AppOrder, error) {
	q := dbq.New(s.pool)
	o, err := q.GetOrder(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return dbq.AppOrder{}, ErrNotFound
	}
	if err != nil {
		return dbq.AppOrder{}, fmt.Errorf("get order: %w", err)
	}
	if o.Status == OrderPaid || o.Status == OrderRefunded {
		return o, nil
	}
	authority, reportedOK := s.gw.Callback(query)
	if authority == "" {
		return dbq.AppOrder{}, ErrMismatch
	}

	var verified payment.Verified
	var verifyErr error
	if reportedOK {
		verified, verifyErr = s.gw.Verify(ctx, authority, o.AmountRial)
		if errors.Is(verifyErr, payment.ErrUnavailable) {
			return o, verifyErr // the payment may still complete; the user can retry the callback
		}
	}

	err = s.inTx(ctx, func(q *dbq.Queries) error {
		cur, err := q.LockOrder(ctx, orderID)
		if err != nil {
			return fmt.Errorf("lock order: %w", err)
		}
		pay, err := q.LockPaymentByAuthority(ctx, authority)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && pay.OrderID != cur.ID) {
			return ErrMismatch
		}
		if err != nil {
			return fmt.Errorf("lock payment: %w", err)
		}
		if cur.Status == OrderPaid || cur.Status == OrderRefunded {
			o = cur
			return nil
		}
		if !reportedOK || verifyErr != nil {
			reason := "cancelled at gateway"
			if verifyErr != nil {
				reason = verifyErr.Error()
			}
			if err := q.SetPaymentFailed(ctx, dbq.SetPaymentFailedParams{ID: pay.ID, Raw: jsonb(map[string]any{"verify": reason})}); err != nil {
				return fmt.Errorf("payment failed: %w", err)
			}
			if cur.Status == OrderPending {
				if err := q.SetOrderStatus(ctx, dbq.SetOrderStatusParams{ID: cur.ID, Status: OrderFailed}); err != nil {
					return fmt.Errorf("order failed: %w", err)
				}
				cur.Status = OrderFailed
			}
			o = cur
			return nil
		}
		// Paid at the gateway. Even an order that expired meanwhile is honoured: the money was taken.
		if err := q.SetPaymentVerified(ctx, dbq.SetPaymentVerifiedParams{
			ID: pay.ID, RefID: text(verified.RefID), CardMask: text(verified.CardMask), Raw: jsonb(map[string]any{"verify": verified.Raw}),
		}); err != nil {
			return fmt.Errorf("payment verified: %w", err)
		}
		if err := s.fulfil(ctx, q, cur); err != nil {
			return err
		}
		cur.Status = OrderPaid
		o = cur
		return nil
	})
	if err != nil {
		return dbq.AppOrder{}, err
	}
	return o, nil
}

// fulfil activates the subscription of a paid order. Placement is recomputed under the user lock, so two orders
// completing at the same time queue one after the other instead of overlapping. The charged amount never changes.
func (s *Service) fulfil(ctx context.Context, q *dbq.Queries, o dbq.AppOrder) error {
	if err := q.LockUserBilling(ctx, o.UserID); err != nil {
		return fmt.Errorf("lock: %w", err)
	}
	held, err := heldOf(ctx, q, o.UserID)
	if err != nil {
		return err
	}
	now, err := dbNow(ctx, q)
	if err != nil {
		return err
	}
	qt, err := QuoteFor(now, held, access.Tier(o.PlanCode), Period(o.Period), o.PriceRial)
	if err != nil {
		return err
	}
	if len(qt.Replaces) > 0 {
		ids := make([]pgtype.UUID, 0, len(qt.Replaces))
		for _, id := range qt.Replaces {
			ids = append(ids, mustUUID(id))
		}
		if err := q.ReplaceSubscriptions(ctx, ids); err != nil {
			return fmt.Errorf("replace: %w", err)
		}
	}
	if _, err := q.InsertOrderSubscription(ctx, dbq.InsertOrderSubscriptionParams{
		UserID: o.UserID, PlanCode: o.PlanCode, StartsAt: ts(qt.Starts), EndsAt: ts(qt.Ends), OrderID: o.ID,
	}); err != nil {
		return fmt.Errorf("insert subscription: %w", err)
	}
	if err := q.SetOrderStatus(ctx, dbq.SetOrderStatusParams{ID: o.ID, Status: OrderPaid}); err != nil {
		return fmt.Errorf("order paid: %w", err)
	}
	s.log.InfoContext(ctx, "subscription activated", "order", uid(o.ID), "plan", o.PlanCode, "kind", qt.Kind,
		"starts", qt.Starts, "ends", qt.Ends, "amount_rial", o.AmountRial)
	return nil
}

// RequestRefund files a refund request for the user's own paid order, if the refund rule allows it (SCOPE §6).
func (s *Service) RequestRefund(ctx context.Context, userID, orderID pgtype.UUID, reason string) (dbq.AppRefund, error) {
	var out dbq.AppRefund
	err := s.inTx(ctx, func(q *dbq.Queries) error {
		o, err := q.LockOrder(ctx, orderID)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && o.UserID != userID) {
			return ErrNotFound // someone else's order looks like no order at all
		}
		if err != nil {
			return fmt.Errorf("lock order: %w", err)
		}
		if _, err := q.GetRefundByOrder(ctx, orderID); err == nil {
			return ErrConflict
		}
		ok, err := s.refundable(ctx, q, o)
		if err != nil {
			return err
		}
		if !ok {
			return ErrNotRefundable
		}
		out, err = q.InsertRefund(ctx, dbq.InsertRefundParams{OrderID: o.ID, AmountRial: o.AmountRial, Reason: text(reason)})
		if err != nil {
			return fmt.Errorf("insert refund: %w", err)
		}
		return nil
	})
	return out, err
}

// Refundable reports whether the user could request a refund for o now.
func (s *Service) Refundable(ctx context.Context, o dbq.AppOrder) (bool, error) {
	return s.refundable(ctx, dbq.New(s.pool), o)
}

func (s *Service) refundable(ctx context.Context, q *dbq.Queries, o dbq.AppOrder) (bool, error) {
	if o.Status != OrderPaid || !o.PaidAt.Valid || o.AmountRial == 0 {
		return false, nil
	}
	sub, err := q.GetSubscriptionByOrder(ctx, o.ID)
	if err != nil {
		return false, fmt.Errorf("subscription of order: %w", err)
	}
	used, err := q.SubscriptionUsed(ctx, sub.ID)
	if err != nil {
		return false, fmt.Errorf("usage: %w", err)
	}
	now, err := dbNow(ctx, q)
	if err != nil {
		return false, err
	}
	return RefundEligible(now, o.PaidAt.Time, used), nil
}

// DecideRefund approves (order refunded, subscription cancelled) or rejects a refund request. The money itself is
// returned by staff outside the system; note records the transfer reference.
func (s *Service) DecideRefund(ctx context.Context, actor audit.Actor, refundID pgtype.UUID, approve bool, note string) (dbq.AppRefund, error) {
	var out dbq.AppRefund
	err := s.inTx(ctx, func(q *dbq.Queries) error {
		r, err := q.LockRefund(ctx, refundID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock refund: %w", err)
		}
		if r.Status != "requested" {
			return ErrConflict
		}
		status := "rejected"
		if approve {
			status = "approved"
			o, err := q.LockOrder(ctx, r.OrderID)
			if err != nil {
				return fmt.Errorf("lock order: %w", err)
			}
			if err := q.LockUserBilling(ctx, o.UserID); err != nil {
				return fmt.Errorf("lock: %w", err)
			}
			sub, err := q.GetSubscriptionByOrder(ctx, o.ID)
			if err != nil {
				return fmt.Errorf("subscription of order: %w", err)
			}
			if err := q.CancelSubscription(ctx, sub.ID); err != nil {
				return fmt.Errorf("cancel subscription: %w", err)
			}
			if err := q.SetOrderStatus(ctx, dbq.SetOrderStatusParams{ID: o.ID, Status: OrderRefunded}); err != nil {
				return fmt.Errorf("order refunded: %w", err)
			}
		}
		if err := q.DecideRefund(ctx, dbq.DecideRefundParams{ID: r.ID, Status: status, Note: text(note), DecidedBy: actor.ID}); err != nil {
			return fmt.Errorf("decide refund: %w", err)
		}
		r.Status, r.Note = status, text(note)
		out = r
		return audit.Write(ctx, q, actor, audit.Entry{
			Action: "refund." + status, Entity: "refund", EntityID: uid(r.ID),
			Data: map[string]any{"order": uid(r.OrderID), "amountRial": r.AmountRial, "note": note},
		})
	})
	return out, err
}

// Grant gives a plan manually (staff). It's queued after the user's current subscription of the same plan, so
// grants extend rather than overlap.
func (s *Service) Grant(ctx context.Context, actor audit.Actor, userID pgtype.UUID, plan access.Tier, days int, note string) (dbq.InsertSubscriptionRow, error) {
	var out dbq.InsertSubscriptionRow
	err := s.inTx(ctx, func(q *dbq.Queries) error {
		if err := q.LockUserBilling(ctx, userID); err != nil {
			return fmt.Errorf("lock: %w", err)
		}
		start, err := q.LatestEndForPlan(ctx, dbq.LatestEndForPlanParams{UserID: userID, PlanCode: string(plan)})
		if err != nil {
			return fmt.Errorf("latest end: %w", err)
		}
		now, err := dbNow(ctx, q)
		if err != nil {
			return err
		}
		from := start.Time.UTC()
		if from.Before(now) {
			from = now
		}
		out, err = q.InsertSubscription(ctx, dbq.InsertSubscriptionParams{
			UserID: userID, PlanCode: string(plan), StartsAt: ts(from), EndsAt: ts(from.AddDate(0, 0, days)),
			Note: text(note), GrantedBy: actor.ID,
		})
		if err != nil {
			return fmt.Errorf("insert subscription: %w", err)
		}
		return audit.Write(ctx, q, actor, audit.Entry{
			Action: "subscription.grant", Entity: "subscription", EntityID: uid(out.ID),
			Data: map[string]any{"userId": uid(userID), "plan": plan, "days": days, "note": note},
		})
	})
	return out, err
}

// RecordUsage notes the first use of a paid feature under a subscription (the refund rule). Cheap to call per
// request: each process writes a given (subscription, feature) once.
func (s *Service) RecordUsage(ctx context.Context, subscriptionID pgtype.UUID, feature access.Feature) {
	if !subscriptionID.Valid {
		return
	}
	k := uid(subscriptionID) + "|" + string(feature)
	if _, seen := s.usageSeen.LoadOrStore(k, true); seen {
		return
	}
	if err := dbq.New(s.pool).RecordUsage(ctx, dbq.RecordUsageParams{SubscriptionID: subscriptionID, Feature: string(feature)}); err != nil {
		s.usageSeen.Delete(k)
		s.log.WarnContext(ctx, "record usage failed", "err", err)
	}
}

// ExpirePending abandons pending orders past their deadline (worker job).
func (s *Service) ExpirePending(ctx context.Context) (int64, error) {
	n, err := dbq.New(s.pool).ExpirePendingOrders(ctx)
	if err != nil {
		return 0, fmt.Errorf("expire pending orders: %w", err)
	}
	return n, nil
}

func heldOf(ctx context.Context, q *dbq.Queries, userID pgtype.UUID) ([]Held, error) {
	rows, err := q.ListHeldSubscriptions(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("held subscriptions: %w", err)
	}
	out := make([]Held, 0, len(rows))
	for _, r := range rows {
		out = append(out, Held{ID: uid(r.ID), Plan: access.Tier(r.PlanCode), Starts: r.StartsAt.Time, Ends: r.EndsAt.Time, PaidRial: r.PaidRial})
	}
	return out, nil
}

func (s *Service) inTx(ctx context.Context, fn func(q *dbq.Queries) error) error {
	if err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return fn(dbq.New(tx)) }); err != nil {
		return fmt.Errorf("billing: %w", err)
	}
	return nil
}

func ts(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t.UTC(), Valid: true} }

func text(s string) pgtype.Text {
	s = strings.TrimSpace(s)
	return pgtype.Text{String: s, Valid: s != ""}
}

func uid(u pgtype.UUID) string { return uuid.UUID(u.Bytes).String() }

func mustUUID(s string) pgtype.UUID {
	var u pgtype.UUID
	_ = u.Scan(s)
	return u
}

func jsonb(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}
