package alerts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// DefaultPerUserDailyRial is one member's price-SMS limit per Tehran day when the setting has none: 50,000 Toman
// (client, 2026-11-04).
const DefaultPerUserDailyRial = 500_000

// Limits are the daily SMS spending limits (site setting "sms", edited in the admin's Settings). 0 = no limit.
type Limits struct {
	DailyBudgetRial  int64 // all SMS of the day together (SECURITY §4 circuit breaker)
	PerUserDailyRial int64 // the price SMS one member receives in a day
}

// settingReader is what LoadLimits needs (dbq.Queries or the API's dbq.Querier).
type settingReader interface {
	GetSiteSetting(ctx context.Context, key string) ([]byte, error)
}

// LoadLimits reads the limits; a missing setting means the default per-member limit and no site budget.
func LoadLimits(ctx context.Context, q settingReader) (Limits, error) {
	l := Limits{PerUserDailyRial: DefaultPerUserDailyRial}
	raw, err := q.GetSiteSetting(ctx, "sms")
	if errors.Is(err, pgx.ErrNoRows) {
		return l, nil
	}
	if err != nil {
		return l, fmt.Errorf("alerts: sms setting: %w", err)
	}
	var cfg struct {
		DailyBudgetRial  *int64 `json:"daily_budget_rial"`
		PerUserDailyRial *int64 `json:"per_user_daily_rial"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return l, nil //nolint:nilerr // a bad setting means the defaults, not a failed job
	}
	if cfg.DailyBudgetRial != nil && *cfg.DailyBudgetRial > 0 {
		l.DailyBudgetRial = *cfg.DailyBudgetRial
	}
	if cfg.PerUserDailyRial != nil {
		l.PerUserDailyRial = max(0, *cfg.PerUserDailyRial)
	}
	return l, nil
}

// SaveLimits stores the limits in the "sms" setting, keeping its other keys (e.g. alert_at_percent).
func SaveLimits(ctx context.Context, q *dbq.Queries, l Limits) error {
	cfg := map[string]any{}
	if raw, err := q.GetSiteSetting(ctx, "sms"); err == nil {
		_ = json.Unmarshal(raw, &cfg)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("alerts: sms setting: %w", err)
	}
	cfg["daily_budget_rial"], cfg["per_user_daily_rial"] = l.DailyBudgetRial, l.PerUserDailyRial
	b, _ := json.Marshal(cfg)
	if err := q.PutSetting(ctx, dbq.PutSettingParams{Key: "sms", Value: b}); err != nil {
		return fmt.Errorf("alerts: save sms setting: %w", err)
	}
	return nil
}
