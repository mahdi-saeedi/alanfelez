-- +goose Up
-- Renewal reminders 7, 3 and 1 day before a plan ends and on the day it ends (client, 2026-10-27; internal/billing):
-- the "expiring" text gains the number of days and an "ended" text is added. Only texts still as seeded change.
UPDATE app.site_settings SET value = jsonb_set(value, '{subscription_expiring}',
  '{"fa": "الان‌فلز: اشتراک {plan} شما {days} روز دیگر ({date}) به پایان می‌رسد. برای تمدید: {url}", "en": "Alan Felez: your {plan} plan ends in {days} days ({date}). Renew at {url}"}'::jsonb)
WHERE key = 'sms_templates'
  AND value #>> '{subscription_expiring,fa}' = 'الان‌فلز: اشتراک {plan} شما در تاریخ {date} به پایان می‌رسد. برای تمدید: {url}';

UPDATE app.site_settings SET value = jsonb_set(value, '{subscription_ended}',
  '{"fa": "الان‌فلز: اشتراک {plan} شما امروز به پایان رسید. برای تمدید: {url}", "en": "Alan Felez: your {plan} plan ended today. Renew at {url}"}'::jsonb)
WHERE key = 'sms_templates' AND NOT value ? 'subscription_ended';

-- +goose Down
UPDATE app.site_settings SET value = value - 'subscription_ended' WHERE key = 'sms_templates';
