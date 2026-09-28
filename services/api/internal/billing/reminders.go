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

// ReminderLead is how long before expiry the renewal reminder goes out (SCOPE §6: 3 days, no auto-renew).
const ReminderLead = 3 * 24 * time.Hour

// Template ids in site setting "sms_templates" (editable in the admin).
const tmplExpiring = "subscription_expiring"

// SendReminders texts users whose plan ends within ReminderLead and who haven't renewed. Each subscription is
// reminded once (dedupe key), so the job can run as often as it likes. plansURL goes into the message.
func (s *Service) SendReminders(ctx context.Context, sms notify.SMS, plansURL string) (int, error) {
	q := dbq.New(s.pool)
	now, err := dbNow(ctx, q)
	if err != nil {
		return 0, err
	}
	due, err := q.ExpiringSubscriptions(ctx, dbq.ExpiringSubscriptionsParams{WindowFrom: ts(now), WindowTo: ts(now.Add(ReminderLead))})
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
		key := tmplExpiring + ":" + uid(d.ID)
		if done, err := q.NotificationSent(ctx, key); err != nil || done {
			continue
		}
		lang := d.Locale
		if lang != "en" {
			lang = "fa"
		}
		date := jalali.Format(d.EndsAt.Time)
		if lang == "en" {
			date = d.EndsAt.Time.In(time.FixedZone("IRST", 3*3600+1800)).Format("2 Jan 2006")
		}
		body := strings.NewReplacer("{plan}", names[d.PlanCode][lang], "{date}", date, "{url}", plansURL).Replace(tmpl[tmplExpiring][lang])
		cost, sendErr := sms.Send(ctx, d.PhoneE164.String, body)
		row := dbq.InsertNotificationParams{
			UserID: d.UserID, Template: tmplExpiring, Recipient: d.PhoneE164.String, Body: body, Status: "sent",
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
	if t[tmplExpiring]["fa"] == "" {
		return nil, errors.New("site setting sms_templates has no subscription_expiring.fa")
	}
	if t[tmplExpiring]["en"] == "" {
		t[tmplExpiring]["en"] = t[tmplExpiring]["fa"]
	}
	return t, nil
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
