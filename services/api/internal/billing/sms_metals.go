package billing

import (
	"context"
	"errors"
	"fmt"
	"math"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Paid SMS metals (client, 2026-11-04; owner OK'd): with Gold, each metal chosen for price SMS costs 100,000 Toman per
// month of the plan (a 3-month plan: 300,000; a year: 1,200,000), on top of the plan and without its discount or
// credit. Paid metals belong to the subscription: they can't be changed or refunded. A member may add metals during
// the plan, each at the full price of the plan's length, whatever is left of it (StartSmsAddon).

// SmsMetalMonthlyRial is one SMS metal for one month: 100,000 Toman.
const SmsMetalMonthlyRial int64 = 1_000_000

// Errors of the SMS metals.
var (
	ErrSmsMetalsGoldOnly = errors.New("SMS metals come with the Gold plan only")
	ErrUnknownMetal      = errors.New("unknown metal")
	ErrNotGold           = errors.New("no active Gold plan")
	ErrNothingToAdd      = errors.New("these metals are already paid for")
)

// PeriodMonths is how many months a billing period pays SMS metals for.
func PeriodMonths(p Period) int {
	switch p {
	case Quarter:
		return 3
	case Year:
		return 12
	}
	return 1
}

// SubscriptionMonths is the length of a subscription in months (30 days each, rounded, at least 1): a granted
// subscription has no period, so its length decides the price of an added metal.
func SubscriptionMonths(starts, ends time.Time) int {
	return max(1, int(math.Round(ends.Sub(starts).Hours()/24/30)))
}

// SmsMetalsPrice is n metals for months months, in Rial.
func SmsMetalsPrice(n, months int) int64 { return int64(n) * int64(months) * SmsMetalMonthlyRial }

// checkMetals de-duplicates slugs and checks each is a metal of the site.
func checkMetals(ctx context.Context, q *dbq.Queries, slugs []string) ([]string, error) {
	if len(slugs) == 0 {
		return []string{}, nil
	}
	metals, err := q.ListMetals(ctx)
	if err != nil {
		return nil, fmt.Errorf("metals: %w", err)
	}
	out := make([]string, 0, len(slugs))
	for _, s := range slugs {
		if !slices.ContainsFunc(metals, func(m dbq.ListMetalsRow) bool { return m.Slug == s }) {
			return nil, ErrUnknownMetal
		}
		if !slices.Contains(out, s) {
			out = append(out, s)
		}
	}
	return out, nil
}

// AddonQuote prices adding SMS metals to the member's current Gold subscription.
type AddonQuote struct {
	Subscription pgtype.UUID
	Paid         []string // metals the subscription already has
	Adding       []string // the new ones being priced
	Months       int
	Amount       int64
	Ends         time.Time
}

// QuoteSmsAddon prices adding metals to the user's Gold subscription active now (none → ErrNotGold).
func (s *Service) QuoteSmsAddon(ctx context.Context, userID pgtype.UUID, metals []string) (AddonQuote, error) {
	return s.quoteAddon(ctx, dbq.New(s.pool), userID, metals)
}

func (s *Service) quoteAddon(ctx context.Context, q *dbq.Queries, userID pgtype.UUID, metals []string) (AddonQuote, error) {
	act, err := q.ActiveSubscription(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !access.Allowed(access.Tier(act.PlanCode), access.AlertsSMS)) {
		return AddonQuote{}, ErrNotGold
	}
	if err != nil {
		return AddonQuote{}, fmt.Errorf("active subscription: %w", err)
	}
	sub, err := q.GetSubscription(ctx, act.ID)
	if err != nil {
		return AddonQuote{}, fmt.Errorf("subscription: %w", err)
	}
	clean, err := checkMetals(ctx, q, metals)
	if err != nil {
		return AddonQuote{}, err
	}
	paid, err := q.SubscriptionSmsMetals(ctx, sub.ID)
	if err != nil {
		return AddonQuote{}, fmt.Errorf("paid metals: %w", err)
	}
	out := AddonQuote{Subscription: sub.ID, Paid: paid, Adding: []string{}, Months: SubscriptionMonths(sub.StartsAt.Time, sub.EndsAt.Time), Ends: sub.EndsAt.Time}
	for _, m := range clean {
		if !slices.Contains(paid, m) {
			out.Adding = append(out.Adding, m)
		}
	}
	out.Amount = SmsMetalsPrice(len(out.Adding), out.Months)
	return out, nil
}

// StartSmsAddon creates (or, for a repeated Idempotency-Key, returns) an order adding SMS metals to the user's Gold
// subscription, and starts its payment. The metals are attached when the payment succeeds (fulfil).
func (s *Service) StartSmsAddon(ctx context.Context, user dbq.UpsertUserRow, metals []string, idemKey, locale string) (Checkout, error) {
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
		aq, err := s.quoteAddon(ctx, q, user.ID, metals)
		if err != nil {
			return err
		}
		if len(aq.Adding) == 0 {
			return ErrNothingToAdd
		}
		period := Month
		switch aq.Months {
		case 3:
			period = Quarter
		case 12:
			period = Year
		}
		price, err := q.CurrentPlanPrice(ctx, dbq.CurrentPlanPriceParams{PlanCode: string(access.Gold), Period: string(period)})
		if err != nil {
			return fmt.Errorf("plan price: %w", err)
		}
		now, err := dbNow(ctx, q)
		if err != nil {
			return err
		}
		o, err := q.InsertOrder(ctx, dbq.InsertOrderParams{
			UserID: user.ID, PlanPriceID: price.ID, PlanCode: string(access.Gold), Period: string(period), Kind: string(KindSmsAddon),
			AmountRial: aq.Amount, StartsAt: ts(now), IdempotencyKey: idemKey, Locale: locale, ExpiresAt: ts(now.Add(PendingTTL)),
			SmsMetals: aq.Adding, SmsRial: aq.Amount, ForSubscription: aq.Subscription,
		})
		if err != nil {
			return fmt.Errorf("insert order: %w", err)
		}
		out.Order, created = o, true
		return nil
	})
	if err != nil {
		return Checkout{}, err
	}
	if out.Order.Status != OrderPending {
		return out, nil
	}
	if !created {
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

// fulfilAddon attaches a paid add-on's metals to its subscription.
func (s *Service) fulfilAddon(ctx context.Context, q *dbq.Queries, o dbq.AppOrder) error {
	if err := q.AddSubscriptionSmsMetals(ctx, dbq.AddSubscriptionSmsMetalsParams{SubscriptionID: o.ForSubscription, OrderID: o.ID, Slugs: o.SmsMetals}); err != nil {
		return fmt.Errorf("add sms metals: %w", err)
	}
	if err := q.SetOrderStatus(ctx, dbq.SetOrderStatusParams{ID: o.ID, Status: OrderPaid}); err != nil {
		return fmt.Errorf("order paid: %w", err)
	}
	s.log.InfoContext(ctx, "sms metals added", "order", uid(o.ID), "metals", o.SmsMetals, "amount_rial", o.AmountRial)
	return nil
}
