// Package subscription answers "which tier does this caller have right now?" (SCOPE §6).
// Anonymous callers and users without an active subscription are free. The feature matrix itself
// lives in internal/access; this package only resolves the tier.
package subscription

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Resolver looks up the caller's current plan.
type Resolver struct{ q dbq.Querier }

// NewResolver returns a resolver backed by q.
func NewResolver(q dbq.Querier) *Resolver { return &Resolver{q: q} }

// Current is the caller's tier and, for paid tiers, when it ends.
type Current struct {
	Tier   access.Tier
	EndsAt *time.Time
}

// Tier resolves the caller's tier. p may be nil (anonymous).
func (r *Resolver) Tier(ctx context.Context, p *auth.Principal) (Current, error) {
	if p == nil {
		return Current{Tier: access.Free}, nil
	}
	row, err := r.q.ActiveSubscription(ctx, p.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Current{Tier: access.Free}, nil
	}
	if err != nil {
		return Current{}, fmt.Errorf("subscription: active: %w", err)
	}
	t := access.Tier(row.PlanCode)
	if !t.Valid() {
		return Current{Tier: access.Free}, nil
	}
	end := row.EndsAt.Time
	return Current{Tier: t, EndsAt: &end}, nil
}
