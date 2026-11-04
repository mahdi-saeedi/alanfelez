package billing

import (
	"context"
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

// The welcome and thank-you SMS (client, 2026-11-04; owner OK'd). Texts: site setting "sms_templates" (same ids) or
// the defaults below; sms.ir sends its approved template with the parameters. A kind whose sms.ir template id isn't
// set (SMSIR_TEMPLATES) is skipped, so these ship before the templates are approved.
const (
	tmplWelcome = "welcome"         // {name}; sms.ir: NAME
	tmplThanks  = "purchase_thanks" // {name} {plan} {date}; sms.ir: NAME, PLAN, DATE
)

// greetWindow is how far back the job looks: an account or a purchase older than this gets no greeting (so a template
// approved weeks later doesn't greet everyone at once).
const greetWindow = 24 * time.Hour

var greetDefaults = map[string]map[string]string{
	tmplWelcome: {
		"fa": "{name} عزیز، به الان\u200cفلز خوش آمدید.\nقیمت لحظه\u200cای، نمودار و تحلیل بازار فلزات، همه در یک\u200cجا:\nalanfelez.ir",
		"en": "Dear {name}, welcome to Alan Felez.\nLive prices, charts and analysis of the metals market, all in one place:\nalanfelez.ir",
	},
	tmplThanks: {
		"fa": "{name} عزیز، اشتراک {plan} شما تا تاریخ {date} فعال شد.\nامیدواریم با اعلام نرخ لحظه به لحظه فلزات در مسیر رشد کنارتان باشیم.",
		"en": "Dear {name}, your {plan} plan is active until {date}.\nWe hope our live metal prices help you grow.",
	},
}

// SendGreetings sends the welcome SMS, once per mobile number ever (app.welcomed_phones), and a thank-you SMS for
// each plan bought or granted by staff (Silver or Gold). Safe to run every minute: the claim and the dedupe keys keep each to once.
func (s *Service) SendGreetings(ctx context.Context, sms notify.SMS) (int, error) {
	q := dbq.New(s.pool)
	now, err := dbNow(ctx, q)
	if err != nil {
		return 0, err
	}
	texts := greetTexts(ctx, q)
	sent := 0

	if notify.Configured(sms, tmplWelcome) {
		users, err := q.UsersToWelcome(ctx, ts(now.Add(-greetWindow)))
		if err != nil {
			return sent, fmt.Errorf("users to welcome: %w", err)
		}
		for _, u := range users {
			// Claim the number first: a failed send isn't retried, but no number is ever welcomed twice.
			if n, err := q.ClaimWelcome(ctx, u.PhoneE164.String); err != nil {
				return sent, fmt.Errorf("claim welcome: %w", err)
			} else if n == 0 {
				continue
			}
			lang := langOf(u.Locale)
			name := personName(u.FirstName, u.LastName, lang)
			body := strings.NewReplacer("{name}", name).Replace(texts[tmplWelcome][lang])
			ok, err := deliverOnce(ctx, q, sms, u.ID, u.PhoneE164.String, tmplWelcome+":"+uid(u.ID), notify.Message{
				Template: tmplWelcome, Body: body, Params: []notify.Param{{Name: "NAME", Value: name}},
			})
			if err != nil {
				return sent, err
			}
			if ok {
				sent++
			}
		}
	}

	if notify.Configured(sms, tmplThanks) {
		subs, err := q.SubscriptionsToThank(ctx, ts(now.Add(-greetWindow)))
		if err != nil {
			return sent, fmt.Errorf("subscriptions to thank: %w", err)
		}
		if len(subs) == 0 {
			return sent, nil
		}
		names, err := planNames(ctx, q)
		if err != nil {
			return sent, err
		}
		for _, sub := range subs {
			lang := langOf(sub.Locale)
			name := personName(sub.FirstName, sub.LastName, lang)
			plan, date := names[sub.PlanCode][lang], jalali.Format(sub.EndsAt.Time)
			if lang == "en" {
				date = sub.EndsAt.Time.In(time.FixedZone("IRST", 3*3600+1800)).Format("2 Jan 2006")
			}
			body := strings.NewReplacer("{name}", name, "{plan}", plan, "{date}", date).Replace(texts[tmplThanks][lang])
			ok, err := deliverOnce(ctx, q, sms, sub.UserID, sub.PhoneE164.String, tmplThanks+":"+uid(sub.ID), notify.Message{
				Template: tmplThanks, Body: body,
				Params: []notify.Param{{Name: "NAME", Value: name}, {Name: "PLAN", Value: plan}, {Name: "DATE", Value: date}},
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

// deliverOnce sends one SMS and logs it under its dedupe key (sent or failed); false when it failed.
func deliverOnce(ctx context.Context, q *dbq.Queries, sms notify.SMS, user pgtype.UUID, phone, key string, m notify.Message) (bool, error) {
	cost, sendErr := sms.Send(ctx, phone, m)
	row := dbq.InsertNotificationParams{
		UserID: user, Template: m.Template, Recipient: phone, Body: m.Body, Status: "sent",
		Provider: sms.Name(), CostRial: int32(min(cost, 1_000_000)), DedupeKey: key, //nolint:gosec // bounded
	}
	if sendErr != nil {
		row.Status, row.Error = "failed", pgtype.Text{String: sendErr.Error(), Valid: true}
	}
	if _, err := q.InsertNotification(ctx, row); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, fmt.Errorf("log notification: %w", err)
	}
	return sendErr == nil, nil
}

// greetTexts are the "sms_templates" texts for the greetings, with the defaults where the setting has none.
func greetTexts(ctx context.Context, q *dbq.Queries) localized {
	t, err := templates(ctx, q)
	if err != nil {
		t = localized{}
	}
	for id, def := range greetDefaults {
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

// personName is "first last", or a polite fallback when the account has no name.
func personName(first, last pgtype.Text, lang string) string {
	name := strings.TrimSpace(first.String + " " + last.String)
	if name != "" {
		return name
	}
	if lang == "en" {
		return "customer"
	}
	return "کاربر"
}

func langOf(locale string) string {
	if locale == "en" {
		return "en"
	}
	return "fa"
}
