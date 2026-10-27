package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/notify"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/jalali"
)

// ReminderDays are the reminders before a plan ends (client, 2026-10-27: a week, 3 days and 1 day before), and one
// more goes out on the day it ends. No auto-renew (SCOPE §6). Each is sent once per subscription.
var ReminderDays = []int{7, 3, 1}

// Template ids in site setting "sms_templates" (editable in the admin) and in the SMS provider's template list.
const (
	tmplExpiring = "subscription_expiring" // {plan} {days} {date} {url}; sms.ir: PLAN, DAYS, DATE
	tmplEnded    = "subscription_ended"    // {plan} {url}; sms.ir: PLAN
)

// endedWindow is how long after a plan ends its "ended" message may still go out (the job runs hourly).
const endedWindow = 24 * time.Hour

// SendReminders texts users whose plan ends within a week, or ended in the last day, and who haven't renewed:
// one message per stage (7, 3, 1 days before; ended). A plan bought with 2 days left gets only the 3-day message
// (with the real number of days), so stages never pile up. Safe to run as often as it likes (dedupe keys).
func (s *Service) SendReminders(ctx context.Context, sms notify.SMS, plansURL string) (int, error) {
	q := dbq.New(s.pool)
	now, err := dbNow(ctx, q)
	if err != nil {
		return 0, err
	}
	lead := time.Duration(ReminderDays[0]) * 24 * time.Hour
	due, err := q.ExpiringSubscriptions(ctx, dbq.ExpiringSubscriptionsParams{WindowFrom: ts(now.Add(-endedWindow)), WindowTo: ts(now.Add(lead))})
	if err != nil {
		return 0, fmt.Errorf("expiring subscriptions: %w", err)
	}
	if len(due) == 0 {
		return 0, nil
	}
	tmpl, err := templates(ctx, q)
	if err != nil {
		return 0, err
	}
	names, err := planNames(ctx, q)
	if err != nil {
		return 0, err
	}
	sent := 0
	for _, d := range due {
		left := d.EndsAt.Time.Sub(now)
		template, key, days := tmplEnded, tmplEnded+":"+uid(d.ID), 0
		if left > 0 {
			stage := Stage(left)
			template, key, days = tmplExpiring, fmt.Sprintf("%s:%d:%s", tmplExpiring, stage, uid(d.ID)), DaysLeft(left)
		}
		if done, err := alreadySent(ctx, q, key, d.ID, template, days); err != nil || done {
			continue
		}
		lang := d.Locale
		if lang != "en" {
			lang = "fa"
		}
		date, daysText := jalali.Format(d.EndsAt.Time), jalali.Digits(fmt.Sprint(days))
		if lang == "en" {
			date, daysText = d.EndsAt.Time.In(time.FixedZone("IRST", 3*3600+1800)).Format("2 Jan 2006"), fmt.Sprint(days)
		}
		plan := names[d.PlanCode][lang]
		body := strings.NewReplacer("{plan}", plan, "{days}", daysText, "{date}", date, "{url}", plansURL).Replace(tmpl[template][lang])
		msg := notify.Message{Template: template, Body: body, Params: []notify.Param{{Name: "PLAN", Value: plan}}}
		if template == tmplExpiring {
			msg.Params = append(msg.Params, notify.Param{Name: "DAYS", Value: daysText}, notify.Param{Name: "DATE", Value: date})
		}
		cost, sendErr := sms.Send(ctx, d.PhoneE164.String, msg)
		row := dbq.InsertNotificationParams{
			UserID: d.UserID, Template: template, Recipient: d.PhoneE164.String, Body: body, Status: "sent",
			Provider: sms.Name(), CostRial: int32(cost), DedupeKey: key, //nolint:gosec // SMS costs are small
		}
		if sendErr != nil {
			row.Status, row.Error = "failed", pgtype.Text{String: sendErr.Error(), Valid: true}
		}
		if _, err := q.InsertNotification(ctx, row); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return sent, fmt.Errorf("log notification: %w", err)
		}
		if sendErr == nil {
			sent++
		}
	}
	return sent, nil
}

// Stage is the reminder a plan with `left` time to go is due for: the smallest of ReminderDays that left fits in.
func Stage(left time.Duration) int {
	stage := ReminderDays[0]
	for _, d := range ReminderDays {
		if left <= time.Duration(d)*24*time.Hour {
			stage = d
		}
	}
	return stage
}

// DaysLeft is the number of days a message says are left: whole days, rounded up, at least 1.
func DaysLeft(left time.Duration) int {
	return max(1, int((left+24*time.Hour-1)/(24*time.Hour)))
}

// alreadySent checks the dedupe key; the 3-day stage also counts the one reminder sent before 2026-10-27 (old key).
func alreadySent(ctx context.Context, q *dbq.Queries, key string, sub pgtype.UUID, template string, days int) (bool, error) {
	done, err := q.NotificationSent(ctx, key)
	if err != nil || done {
		return done, err //nolint:wrapcheck // a dbq error; the caller skips the row
	}
	if template == tmplExpiring && days <= 3 {
		return q.NotificationSent(ctx, tmplExpiring+":"+uid(sub)) //nolint:wrapcheck // as above
	}
	return false, nil
}

type localized = map[string]map[string]string // id → lang → text

func templates(ctx context.Context, q *dbq.Queries) (localized, error) {
	raw, err := q.GetSiteSetting(ctx, "sms_templates")
	if err != nil {
		return nil, fmt.Errorf("site setting sms_templates: %w", err)
	}
	var t localized
	if err := json.Unmarshal(raw, &t); err != nil {
		return nil, fmt.Errorf("site setting sms_templates: %w", err)
	}
	for _, id := range []string{tmplExpiring, tmplEnded} {
		if t[id] == nil {
			t[id] = map[string]string{}
		}
		if t[id]["fa"] == "" {
			t[id]["fa"] = defaultTexts[id]
		}
		if t[id]["en"] == "" {
			t[id]["en"] = t[id]["fa"]
		}
	}
	return t, nil
}

// defaultTexts are used when the site setting lacks a text (the same as the seed).
var defaultTexts = map[string]string{
	tmplExpiring: "الان\u200cفلز: اشتراک {plan} شما {days} روز دیگر ({date}) به پایان می\u200cرسد. برای تمدید: {url}",
	tmplEnded:    "الان\u200cفلز: اشتراک {plan} شما امروز به پایان رسید. برای تمدید: {url}",
}

func planNames(ctx context.Context, q *dbq.Queries) (localized, error) {
	plans, err := q.ListActivePlans(ctx)
	if err != nil {
		return nil, fmt.Errorf("plans: %w", err)
	}
	out := localized{}
	for _, p := range plans {
		en := p.NameEn.String
		if en == "" {
			en = p.NameFa
		}
		out[p.Code] = map[string]string{"fa": p.NameFa, "en": en}
	}
	return out, nil
}
