package alerts

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/notify"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/jalali"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// Automatic Gold SMS about the user's main metal (client, 2026-10-27; owner OK'd). Global prices don't count.
const (
	// UpdateQuiet is how long a metal's prices must stay unchanged before its "prices updated" SMS goes out, so a
	// staff member entering 15 products sends one SMS, not 15.
	UpdateQuiet = 15 * time.Minute
	// UpdatesPerDay is how many "prices updated" SMS a user receives per Tehran day at most.
	UpdatesPerDay = 3
	// BigMoveBp is the move against the previous day that sends an alert (10 %, up or down), once per product and day.
	BigMoveBp = 1000
	// QuietFrom is the Tehran hour the night pause starts: nothing is sent until QuietUntil, when what's due goes out.
	QuietFrom = 22
	// QuietUntil is the Tehran hour the night pause ends.
	QuietUntil = 8
)

// Template ids (sms_templates texts and sms.ir templates).
const (
	tmplUpdate = "price_update" // {metal} {count}; sms.ir: METAL, COUNT
	tmplMove   = "price_move"   // {product} {price} {change}; sms.ir: the price_alert template (PRODUCT, PRICE, CHANGE)
)

var autoDefaults = map[string]map[string]string{
	tmplUpdate: {"fa": "الان\u200cفلز - به\u200cروزرسانی قیمت\nفلز: {metal}\nتعداد محصولات: {count}", "en": "Alan Felez: {metal} prices updated ({count} products)"},
	tmplMove:   {"fa": "الان\u200cفلز - هشدار قیمت\nکالا: {product}\nقیمت: {price}\nتغییر: {change}", "en": "Alan Felez price alert: {product} {price} ({change})"},
}

// Quiet reports whether t falls in the night pause (Tehran time).
func Quiet(t time.Time) bool {
	h := t.In(prices.Tehran).Hour()
	return h >= QuietFrom || h < QuietUntil
}

// BatchReady reports whether a metal whose last price change was at last can be announced at now.
func BatchReady(last, now time.Time) bool { return now.Sub(last) >= UpdateQuiet }

// Auto sends the automatic Gold SMS: "prices updated" per metal batch and the 10 % move alerts. Safe to run every
// minute: cursors, dedupe keys and daily caps keep each message to once.
func (s *Service) Auto(ctx context.Context) (sent int, err error) {
	dbNow, err := dbq.New(s.pool).DBNow(ctx)
	if err != nil {
		return 0, fmt.Errorf("alerts: db time: %w", err)
	}
	return s.AutoAt(ctx, dbNow.Time.UTC())
}

// AutoAt is Auto as if it were now (tests: quiet hours and the batch wait depend on the time of day).
func (s *Service) AutoAt(ctx context.Context, now time.Time) (sent int, err error) {
	q := dbq.New(s.pool)
	if Quiet(now) {
		return 0, nil
	}
	dayStart := tehranMidnight(now)
	if over, err := s.overBudget(ctx, q, dayStart); err != nil || over {
		return 0, err
	}
	if err := q.InitPriceUpdateCursors(ctx); err != nil {
		return 0, fmt.Errorf("alerts: cursors: %w", err)
	}
	texts := autoTexts(ctx, q)
	gold := map[pgtype.UUID]bool{}
	isGold := func(u pgtype.UUID) (bool, error) {
		if v, ok := gold[u]; ok {
			return v, nil
		}
		v, err := s.allowed(ctx, q, u)
		gold[u] = v
		return v, err
	}

	// 1. "Prices updated", one per metal batch.
	changes, err := q.MetalPriceChanges(ctx)
	if err != nil {
		return sent, fmt.Errorf("alerts: price changes: %w", err)
	}
	for _, c := range changes {
		if !BatchReady(c.LastChange.Time, now) {
			continue
		}
		subs, err := q.MetalSmsSubscribers(ctx, pgtype.Int2{Int16: c.MetalID, Valid: true})
		if err != nil {
			return sent, fmt.Errorf("alerts: subscribers: %w", err)
		}
		for _, u := range subs {
			if ok, err := isGold(u.UserID); err != nil || !ok {
				if err != nil {
					return sent, err
				}
				continue
			}
			n, err := q.NotificationsSentSince(ctx, dbq.NotificationsSentSinceParams{UserID: u.UserID, Template: tmplUpdate, Since: pgtype.Timestamptz{Time: dayStart, Valid: true}})
			if err != nil {
				return sent, fmt.Errorf("alerts: daily count: %w", err)
			}
			if n >= UpdatesPerDay {
				continue
			}
			lang := langOf(u.Locale)
			metal := c.MetalFa
			if lang == "en" && c.MetalEn.Valid && c.MetalEn.String != "" {
				metal = c.MetalEn.String
			}
			count := fmt.Sprint(c.Changed)
			if lang == "fa" {
				count = jalali.Digits(count)
			}
			body := strings.NewReplacer("{metal}", metal, "{count}", count).Replace(texts[tmplUpdate][lang])
			key := fmt.Sprintf("%s:%s:%d:%d", tmplUpdate, uuid.UUID(u.UserID.Bytes), c.MetalID, c.LastChange.Time.UnixMicro())
			ok, err := s.deliver(ctx, q, u.UserID, u.PhoneE164.String, key, tmplUpdate, notify.Message{
				Template: tmplUpdate, Body: body, Params: []notify.Param{{Name: "METAL", Value: metal}, {Name: "COUNT", Value: count}},
			})
			if err != nil {
				return sent, err
			}
			if ok {
				sent++
			}
		}
		if err := q.SetPriceUpdateCursor(ctx, dbq.SetPriceUpdateCursorParams{MetalID: c.MetalID, Through: c.LastChange}); err != nil {
			return sent, fmt.Errorf("alerts: cursor: %w", err)
		}
	}

	// 2. Moves of 10 % or more against the previous day, once per product and day.
	moves, err := q.BigDailyMoves(ctx, BigMoveBp)
	if err != nil {
		return sent, fmt.Errorf("alerts: moves: %w", err)
	}
	if len(moves) == 0 {
		return sent, nil
	}
	subs, err := q.MetalSmsSubscribers(ctx, pgtype.Int2{})
	if err != nil {
		return sent, fmt.Errorf("alerts: subscribers: %w", err)
	}
	day := now.In(prices.Tehran).Format(time.DateOnly)
	for _, m := range moves {
		ch, _ := prices.ChangeFrom(&m.PrevCloseMinor, m.PriceMinor)
		for _, u := range subs {
			if !u.MetalID.Valid || u.MetalID.Int16 != m.MetalID {
				continue
			}
			if ok, err := isGold(u.UserID); err != nil || !ok {
				if err != nil {
					return sent, err
				}
				continue
			}
			lang := langOf(u.Locale)
			product := m.ProductFa
			if lang == "en" && m.ProductEn.Valid && m.ProductEn.String != "" {
				product = m.ProductEn.String
			}
			price, change := FormatPrice(m.PriceMinor, m.Currency, m.Unit, lang), FormatBp(ch.Bp, lang)
			body := strings.NewReplacer("{product}", product, "{price}", price, "{change}", change).Replace(texts[tmplMove][lang])
			key := fmt.Sprintf("%s:%s:%d:%s", tmplMove, uuid.UUID(u.UserID.Bytes), m.SeriesID, day)
			ok, err := s.deliver(ctx, q, u.UserID, u.PhoneE164.String, key, tmplMove, notify.Message{
				Template: "price_alert", Body: body,
				Params: []notify.Param{{Name: "PRODUCT", Value: product}, {Name: "PRICE", Value: price}, {Name: "CHANGE", Value: change}},
			})
			if err != nil {
				return sent, err
			}
			if ok {
				sent++
			}
		}
	}
	return sent, nil
}

// deliver sends one SMS unless its dedupe key was used, and logs it in app.notifications.
func (s *Service) deliver(ctx context.Context, q *dbq.Queries, user pgtype.UUID, phone, key, template string, m notify.Message) (bool, error) {
	if done, err := q.NotificationSent(ctx, key); err != nil {
		return false, fmt.Errorf("alerts: dedupe: %w", err)
	} else if done {
		return false, nil
	}
	cost, sendErr := s.sms.Send(ctx, phone, m)
	row := dbq.InsertNotificationParams{
		UserID: user, Template: template, Recipient: phone, Body: m.Body, Status: "sent",
		Provider: s.sms.Name(), CostRial: int32(min(cost, 1_000_000)), DedupeKey: key, //nolint:gosec // bounded
	}
	if sendErr != nil {
		row.Status, row.Error = "failed", pgtype.Text{String: sendErr.Error(), Valid: true}
		s.log.WarnContext(ctx, "price SMS failed", "template", template, "err", sendErr)
	}
	if _, err := q.InsertNotification(ctx, row); err != nil && !isNoRows(err) {
		return false, fmt.Errorf("alerts: log notification: %w", err)
	}
	return sendErr == nil, nil
}

// autoTexts are the sms_templates texts, with defaults for the ones the setting lacks.
func autoTexts(ctx context.Context, q *dbq.Queries) localized {
	t := localized{}
	if raw, err := templatesRaw(ctx, q); err == nil {
		t = raw
	}
	for id, def := range autoDefaults {
		if t[id] == nil {
			t[id] = map[string]string{}
		}
		for _, lang := range []string{"fa", "en"} {
			if t[id][lang] == "" {
				t[id][lang] = def[lang]
			}
		}
	}
	return t
}

func langOf(locale string) string {
	if locale == "en" {
		return "en"
	}
	return "fa"
}

func isNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
