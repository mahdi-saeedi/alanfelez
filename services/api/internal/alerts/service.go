package alerts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/notify"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/jalali"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// Service checks alerts and sends the SMS.
type Service struct {
	pool   *pgxpool.Pool
	sms    notify.SMS
	webURL string // links in the SMS
	log    *slog.Logger
}

// NewService returns an alert checker. webURL is the public website (no trailing slash needed).
func NewService(pool *pgxpool.Pool, sms notify.SMS, webURL string, log *slog.Logger) *Service {
	return &Service{pool: pool, sms: sms, webURL: strings.TrimSuffix(webURL, "/"), log: log}
}

// Check evaluates every active alert once and sends what's due. Safe to run as often as prices update: firing is
// edge-triggered (armed), rate-limited per alert (MinInterval) and per user (DailyCapPerUser), and every SMS has
// a dedupe key, so a retried job never sends twice. Users whose plan no longer includes alerts are skipped.
func (s *Service) Check(ctx context.Context) (sent int, err error) {
	q := dbq.New(s.pool)
	dbNow, err := q.DBNow(ctx)
	if err != nil {
		return 0, fmt.Errorf("alerts: db time: %w", err)
	}
	now := dbNow.Time.UTC()
	dayStart := tehranMidnight(now)
	if over, err := s.overBudget(ctx, q, dayStart); err != nil || over {
		return 0, err
	}
	candidates, err := q.AlertCandidates(ctx)
	if err != nil {
		return 0, fmt.Errorf("alerts: candidates: %w", err)
	}
	if len(candidates) == 0 {
		return 0, nil
	}
	tmpl, err := templates(ctx, q)
	if err != nil {
		return 0, err
	}
	gold := map[pgtype.UUID]bool{}
	sentToday := map[pgtype.UUID]int{}
	for _, c := range candidates {
		allowed, ok := gold[c.UserID]
		if !ok {
			if allowed, err = s.allowed(ctx, q, c.UserID); err != nil {
				return sent, err
			}
			gold[c.UserID] = allowed
		}
		if !allowed {
			continue
		}
		a := Alert{Kind: Kind(c.Kind), Threshold: c.ThresholdMinor.Int64, MoveBp: int64(c.MoveBp.Int32), Armed: c.Armed}
		if c.LastTriggeredAt.Valid {
			a.LastTriggered = &c.LastTriggeredAt.Time
		}
		quote := Quote{Price: c.PriceMinor}
		if c.PrevCloseMinor.Valid {
			quote.PrevClose = &c.PrevCloseMinor.Int64
		}
		d := Evaluate(a, quote, now)
		if !d.Fire {
			if d.Armed != a.Armed {
				if err := q.MarkAlert(ctx, dbq.MarkAlertParams{ID: c.ID, Armed: d.Armed}); err != nil {
					return sent, fmt.Errorf("alerts: re-arm: %w", err)
				}
			}
			continue
		}
		if _, ok := sentToday[c.UserID]; !ok {
			n, err := q.AlertsSentSince(ctx, dbq.AlertsSentSinceParams{UserID: c.UserID, Since: pgtype.Timestamptz{Time: dayStart, Valid: true}})
			if err != nil {
				return sent, fmt.Errorf("alerts: daily count: %w", err)
			}
			sentToday[c.UserID] = int(n)
		}
		if sentToday[c.UserID] >= DailyCapPerUser {
			s.log.InfoContext(ctx, "price alert skipped: daily cap reached", "alert", uuid.UUID(c.ID.Bytes).String())
			continue
		}
		ok, err := s.send(ctx, q, c, a, tmpl, now)
		if err != nil {
			return sent, err
		}
		if ok {
			sent++
			sentToday[c.UserID]++
		}
		if err := q.MarkAlert(ctx, dbq.MarkAlertParams{ID: c.ID, Armed: d.Armed, Triggered: true}); err != nil {
			return sent, fmt.Errorf("alerts: mark: %w", err)
		}
	}
	return sent, nil
}

func (s *Service) send(ctx context.Context, q *dbq.Queries, c dbq.AlertCandidatesRow, a Alert, tmpl localized, now time.Time) (bool, error) {
	lang := "fa"
	if c.Locale == "en" {
		lang = "en"
	}
	product := c.ProductFa
	if lang == "en" && c.ProductEn.Valid && c.ProductEn.String != "" {
		product = c.ProductEn.String
	}
	change := ""
	if ch, ok := prices.ChangeFrom(nullable(c.PrevCloseMinor), c.PriceMinor); ok {
		change = FormatBp(ch.Bp, lang)
	}
	path := "/chart?series=" + c.SeriesSlug
	if lang == "en" {
		path = "/en" + path
	}
	template := "price_alert_" + c.Kind
	body := strings.NewReplacer(
		"{product}", product,
		"{price}", FormatPrice(c.PriceMinor, c.Currency, c.Unit, lang),
		"{threshold}", FormatPrice(a.Threshold, c.Currency, c.Unit, lang),
		"{change}", change,
		"{url}", s.webURL+path,
	).Replace(tmpl[template][lang])

	// One SMS per firing: above/below are keyed by the previous firing (the same until MarkAlert stores this one, so
	// a retried job can't send twice), move by the Tehran day.
	prev := "first"
	if a.LastTriggered != nil {
		prev = a.LastTriggered.UTC().Format(time.RFC3339Nano)
	}
	key := template + ":" + uuid.UUID(c.ID.Bytes).String() + ":" + prev
	if a.Kind == Move {
		key = template + ":" + uuid.UUID(c.ID.Bytes).String() + ":" + now.In(prices.Tehran).Format(time.DateOnly)
	}
	if done, err := q.NotificationSent(ctx, key); err != nil {
		return false, fmt.Errorf("alerts: dedupe: %w", err)
	} else if done {
		return false, nil
	}
	// One sms.ir template serves the three kinds: PRODUCT, PRICE and CHANGE (the threshold crossed, or the move).
	note := change
	switch a.Kind {
	case Above:
		note = map[string]string{"fa": "بالاتر از ", "en": "above "}[lang] + FormatPrice(a.Threshold, c.Currency, c.Unit, lang)
	case Below:
		note = map[string]string{"fa": "پایین\u200cتر از ", "en": "below "}[lang] + FormatPrice(a.Threshold, c.Currency, c.Unit, lang)
	}
	msg := notify.Message{Template: "price_alert", Body: body, Params: []notify.Param{
		{Name: "PRODUCT", Value: product}, {Name: "PRICE", Value: FormatPrice(c.PriceMinor, c.Currency, c.Unit, lang)}, {Name: "CHANGE", Value: note},
	}}
	cost, sendErr := s.sms.Send(ctx, c.PhoneE164.String, msg)
	row := dbq.InsertNotificationParams{
		UserID: c.UserID, Template: template, Recipient: c.PhoneE164.String, Body: body, Status: "sent",
		Provider: s.sms.Name(), CostRial: int32(min(cost, 1_000_000)), DedupeKey: key, //nolint:gosec // bounded
	}
	if sendErr != nil {
		row.Status, row.Error = "failed", pgtype.Text{String: sendErr.Error(), Valid: true}
		s.log.WarnContext(ctx, "price alert SMS failed", "err", sendErr)
	}
	if _, err := q.InsertNotification(ctx, row); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, fmt.Errorf("alerts: log notification: %w", err)
	}
	return sendErr == nil, nil
}

// allowed reports whether the user's current plan includes SMS alerts (access matrix, never SQL).
func (s *Service) allowed(ctx context.Context, q *dbq.Queries, user pgtype.UUID) (bool, error) {
	sub, err := q.ActiveSubscription(ctx, user)
	if errors.Is(err, pgx.ErrNoRows) {
		return access.Allowed(access.Free, access.AlertsSMS), nil
	}
	if err != nil {
		return false, fmt.Errorf("alerts: subscription: %w", err)
	}
	return access.Allowed(access.Tier(sub.PlanCode), access.AlertsSMS), nil
}

// overBudget is the SMS circuit breaker (SECURITY §4): alerts pause once today's SMS spend reaches the budget.
func (s *Service) overBudget(ctx context.Context, q *dbq.Queries, since time.Time) (bool, error) {
	raw, err := q.GetSiteSetting(ctx, "sms")
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("alerts: sms setting: %w", err)
	}
	var cfg struct {
		DailyBudgetRial int64 `json:"daily_budget_rial"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil || cfg.DailyBudgetRial <= 0 {
		return false, nil //nolint:nilerr // a missing or bad budget means "no budget", not a failed job
	}
	spent, err := q.SMSCostSince(ctx, pgtype.Timestamptz{Time: since, Valid: true})
	if err != nil {
		return false, fmt.Errorf("alerts: sms spend: %w", err)
	}
	if spent >= cfg.DailyBudgetRial {
		s.log.WarnContext(ctx, "price alerts paused: daily SMS budget reached", "spent_rial", spent, "budget_rial", cfg.DailyBudgetRial)
		return true, nil
	}
	return false, nil
}

type localized = map[string]map[string]string

func templates(ctx context.Context, q *dbq.Queries) (localized, error) {
	raw, err := q.GetSiteSetting(ctx, "sms_templates")
	if err != nil {
		return nil, fmt.Errorf("alerts: site setting sms_templates: %w", err)
	}
	var t localized
	if err := json.Unmarshal(raw, &t); err != nil {
		return nil, fmt.Errorf("alerts: site setting sms_templates: %w", err)
	}
	for _, k := range []string{"price_alert_above", "price_alert_below", "price_alert_move"} {
		if t[k]["fa"] == "" {
			return nil, fmt.Errorf("alerts: site setting sms_templates has no %s.fa", k)
		}
		if t[k]["en"] == "" {
			t[k]["en"] = t[k]["fa"]
		}
	}
	return t, nil
}

func tehranMidnight(t time.Time) time.Time {
	y, m, d := t.In(prices.Tehran).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, prices.Tehran).UTC()
}

func nullable(v pgtype.Int8) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

// FormatPrice renders a price in its display unit, like the website: IRR minor (Rial/kg) as Toman per kg,
// USD minor (cents/ton) as dollars per ton.
func FormatPrice(minor int64, currency, unit, lang string) string {
	if currency == "USD" {
		v := group(strconv.FormatInt(minor/100, 10), lang)
		if lang == "fa" {
			return v + " دلار/" + unitFa(unit)
		}
		return "$" + v + "/" + unit
	}
	v := group(strconv.FormatInt(minor/10, 10), lang)
	if lang == "fa" {
		return v + " تومان/" + unitFa(unit)
	}
	return v + " Toman/" + unit
}

// FormatBp renders a signed change, e.g. +3.25% (Persian digits for fa).
func FormatBp(bp int64, lang string) string {
	sign := "+"
	if bp < 0 {
		sign, bp = "−", -bp
	}
	s := fmt.Sprintf("%s%d.%02d%%", sign, bp/100, bp%100)
	if lang == "fa" {
		s = jalali.Digits(strings.Replace(s, ".", "٫", 1))
		s = strings.Replace(s, "%", "٪", 1)
	}
	return s
}

func unitFa(unit string) string {
	if unit == "ton" {
		return "تن"
	}
	return "کیلوگرم"
}

func group(digits, lang string) string {
	sep := ","
	if lang == "fa" {
		sep = "٬"
	}
	var b strings.Builder
	for i, r := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteString(sep)
		}
		b.WriteRune(r)
	}
	if lang == "fa" {
		return jalali.Digits(b.String())
	}
	return b.String()
}
