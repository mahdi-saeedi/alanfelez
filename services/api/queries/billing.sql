-- Accounts and billing (internal/billing). Money = Rial. Every write that changes what a user holds runs under
-- LockUserBilling in one transaction, so concurrent checkouts can't overlap subscriptions.

-- name: UpsertUser :one
-- The sign-up answers (activity, metals, province) are kept when a token doesn't carry them (staff, older tokens).
INSERT INTO app.users (id, username, phone_e164, first_name, last_name, email, activity, metals, province, last_seen_at)
VALUES (sqlc.arg(id), sqlc.arg(username), sqlc.narg(phone_e164), sqlc.narg(first_name), sqlc.narg(last_name), sqlc.narg(email),
        sqlc.narg(activity), sqlc.narg(metals)::text[], sqlc.narg(province), now())
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username, phone_e164 = COALESCE(EXCLUDED.phone_e164, app.users.phone_e164),
  first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, email = EXCLUDED.email,
  activity = COALESCE(EXCLUDED.activity, app.users.activity), metals = COALESCE(EXCLUDED.metals, app.users.metals),
  province = COALESCE(EXCLUDED.province, app.users.province), last_seen_at = now()
RETURNING id, username, phone_e164, first_name, last_name, email, locale, blocked_at, created_at;

-- name: GetUser :one
SELECT id, username, phone_e164, first_name, last_name, email, locale, blocked_at, created_at FROM app.users WHERE id = $1;

-- name: SearchUsers :many
-- Admin search by mobile, name or id prefix, newest first, with the plan they hold now.
SELECT u.id, u.username, u.phone_e164, u.first_name, u.last_name, u.email, u.created_at, u.last_seen_at, u.blocked_at,
       u.activity, u.metals, u.province,
       coalesce(cur.plan_code, 'free')::text AS current_plan, cur.ends_at AS current_ends_at
FROM app.users u
LEFT JOIN LATERAL (
  SELECT s.plan_code, s.ends_at FROM app.subscriptions s JOIN app.plans p ON p.code = s.plan_code
  WHERE s.user_id = u.id AND s.status = 'active' AND s.starts_at <= now() AND s.ends_at > now()
  ORDER BY p.rank DESC LIMIT 1
) cur ON true
WHERE sqlc.arg(q)::text = ''
   OR u.username ILIKE '%' || sqlc.arg(q)::text || '%'
   OR u.phone_e164 ILIKE '%' || sqlc.arg(q)::text || '%'
   OR (coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) ILIKE '%' || sqlc.arg(q)::text || '%'
   OR u.id::text LIKE sqlc.arg(q)::text || '%'
ORDER BY u.last_seen_at DESC
LIMIT 50;

-- name: LockUserBilling :exec
SELECT pg_advisory_xact_lock(hashtextextended('billing:' || sqlc.arg(user_id)::uuid::text, 0));

-- name: ListHeldSubscriptions :many
-- Active subscriptions that haven't ended, with the value paid for them (0 for manual grants).
SELECT s.id, s.plan_code, s.starts_at, s.ends_at, coalesce(o.price_rial, 0)::bigint AS paid_rial
FROM app.subscriptions s
LEFT JOIN app.orders o ON o.id = s.order_id
WHERE s.user_id = $1 AND s.status = 'active' AND s.ends_at > now()
ORDER BY s.starts_at;

-- name: ListUserSubscriptions :many
SELECT s.id, s.plan_code, s.starts_at, s.ends_at, s.status, s.origin, s.order_id
FROM app.subscriptions s WHERE s.user_id = $1 ORDER BY s.starts_at DESC LIMIT 50;

-- name: CurrentPlanPrice :one
SELECT pp.id, pp.amount_rial FROM app.plan_prices pp JOIN app.plans p ON p.code = pp.plan_code
WHERE pp.plan_code = $1 AND pp.period = $2 AND pp.valid_to IS NULL AND pp.valid_from <= now() AND p.active;

-- name: FeatureEnabled :one
SELECT coalesce((SELECT enabled FROM app.feature_flags WHERE key = $1), false)::boolean;

-- Orders ----------------------------------------------------------------------------------------------------

-- name: FindOrderByKey :one
SELECT * FROM app.orders WHERE user_id = $1 AND idempotency_key = $2;

-- name: InsertOrder :one
INSERT INTO app.orders (user_id, plan_price_id, plan_code, period, kind, price_rial, credit_rial, amount_rial,
                        starts_at, idempotency_key, locale, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING *;

-- name: GetOrder :one
SELECT * FROM app.orders WHERE id = $1;

-- name: LockOrder :one
SELECT * FROM app.orders WHERE id = $1 FOR UPDATE;

-- name: SetOrderStatus :exec
UPDATE app.orders SET status = $2, paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END WHERE id = $1;

-- name: ListUserOrders :many
SELECT o.*, p.ref_id, r.status AS refund_status
FROM app.orders o
LEFT JOIN LATERAL (SELECT ref_id FROM app.payments WHERE order_id = o.id AND status = 'verified' LIMIT 1) p ON true
LEFT JOIN app.refunds r ON r.order_id = o.id
WHERE o.user_id = $1 AND o.status <> 'expired'
ORDER BY o.created_at DESC LIMIT 50;

-- name: AdminListOrders :many
SELECT o.*, u.username, p.ref_id, coalesce(p.gateway, '')::text AS gateway, r.id AS refund_id, r.status AS refund_status, r.reason AS refund_reason
FROM app.orders o
LEFT JOIN app.users u ON u.id = o.user_id
LEFT JOIN LATERAL (SELECT ref_id, gateway FROM app.payments WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) p ON true
LEFT JOIN app.refunds r ON r.order_id = o.id
WHERE (sqlc.narg(status)::text IS NULL OR o.status = sqlc.narg(status)::text)
  AND (sqlc.narg(refund_status)::text IS NULL OR r.status = sqlc.narg(refund_status)::text)
  AND (sqlc.narg(user_id)::uuid IS NULL OR o.user_id = sqlc.narg(user_id)::uuid)
ORDER BY o.created_at DESC LIMIT 100;

-- name: ExpirePendingOrders :execrows
UPDATE app.orders SET status = 'expired' WHERE status = 'pending' AND expires_at < now();

-- Payments --------------------------------------------------------------------------------------------------

-- name: InsertPayment :one
INSERT INTO app.payments (order_id, gateway, authority, amount_rial, raw) VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: LockPaymentByAuthority :one
SELECT * FROM app.payments WHERE authority = $1 FOR UPDATE;

-- name: SetPaymentVerified :exec
UPDATE app.payments SET status = 'verified', ref_id = $2, card_mask = $3, raw = raw || $4, verified_at = now() WHERE id = $1;

-- name: SetPaymentFailed :exec
UPDATE app.payments SET status = 'failed', raw = raw || $2 WHERE id = $1 AND status = 'initiated';

-- Subscriptions ---------------------------------------------------------------------------------------------

-- name: InsertOrderSubscription :one
INSERT INTO app.subscriptions (user_id, plan_code, starts_at, ends_at, origin, order_id)
VALUES ($1, $2, $3, $4, 'order', $5)
RETURNING id, user_id, plan_code, starts_at, ends_at, status, origin, note;

-- name: ReplaceSubscriptions :exec
-- An upgrade ends running lower plans now; queued ones keep their dates and simply never start (status).
UPDATE app.subscriptions SET status = 'replaced',
  ends_at = CASE WHEN starts_at < now() THEN LEAST(ends_at, now()) ELSE ends_at END
WHERE id = ANY(sqlc.arg(ids)::uuid[]) AND status = 'active';

-- name: GetSubscriptionByOrder :one
SELECT id, user_id, plan_code, starts_at, ends_at, status FROM app.subscriptions WHERE order_id = $1;

-- name: CancelSubscription :exec
-- Same rule as ReplaceSubscriptions: shorten a running plan to now, leave a queued one's dates (ends_at > starts_at).
UPDATE app.subscriptions SET status = 'cancelled',
  ends_at = CASE WHEN starts_at < now() THEN LEAST(ends_at, now()) ELSE ends_at END
WHERE id = $1;

-- name: LatestEndForPlan :one
-- For manual grants: extend after the latest active subscription of the same plan.
SELECT coalesce(max(ends_at), now())::timestamptz FROM app.subscriptions
WHERE user_id = $1 AND plan_code = $2 AND status = 'active' AND ends_at > now();

-- Paid-feature usage (refund rule) -----------------------------------------------------------------------------

-- name: RecordUsage :exec
INSERT INTO app.entitlement_usage (subscription_id, feature) VALUES ($1, $2) ON CONFLICT DO NOTHING;

-- name: SubscriptionUsed :one
SELECT EXISTS (SELECT 1 FROM app.entitlement_usage WHERE subscription_id = $1);

-- Refunds ---------------------------------------------------------------------------------------------------

-- name: InsertRefund :one
INSERT INTO app.refunds (order_id, amount_rial, reason) VALUES ($1, $2, $3) RETURNING *;

-- name: GetRefundByOrder :one
SELECT * FROM app.refunds WHERE order_id = $1;

-- name: LockRefund :one
SELECT * FROM app.refunds WHERE id = $1 FOR UPDATE;

-- name: DecideRefund :exec
UPDATE app.refunds SET status = $2, note = $3, decided_by = $4, decided_at = now() WHERE id = $1;

-- Notifications ---------------------------------------------------------------------------------------------

-- name: ExpiringSubscriptions :many
-- Paid or granted plans ending in the window with nothing queued after them, and a phone to remind.
SELECT s.id, s.user_id, s.plan_code, s.ends_at, u.phone_e164, u.locale
FROM app.subscriptions s
JOIN app.users u ON u.id = s.user_id
WHERE s.status = 'active' AND s.ends_at > sqlc.arg(window_from) AND s.ends_at <= sqlc.arg(window_to)
  AND u.phone_e164 IS NOT NULL AND u.blocked_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM app.subscriptions n
    WHERE n.user_id = s.user_id AND n.status = 'active' AND n.id <> s.id AND n.ends_at > s.ends_at
  );

-- name: InsertNotification :one
INSERT INTO app.notifications (user_id, channel, template, recipient, body, status, provider, cost_rial, error, dedupe_key)
VALUES ($1, 'sms', $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (dedupe_key) DO NOTHING
RETURNING id;

-- name: NotificationSent :one
SELECT EXISTS (SELECT 1 FROM app.notifications WHERE dedupe_key = $1);

-- name: GetSiteSetting :one
SELECT value FROM app.site_settings WHERE key = $1;

-- name: DBNow :one
-- Billing uses the database clock, so "starts now" and "is active now" (now() in SQL) can never disagree.
SELECT now()::timestamptz;

-- name: AdminListNotifications :many
-- The latest SMS sent or tried (admin «پیامک‌ها»), newest first, with the user's name when known.
SELECT n.id, n.created_at, n.template, n.recipient, n.status, n.provider, n.error,
       u.username, u.first_name, u.last_name
FROM app.notifications n
LEFT JOIN app.users u ON u.id = n.user_id
WHERE (sqlc.narg(status)::text IS NULL OR n.status = sqlc.narg(status)::text)
ORDER BY n.created_at DESC
LIMIT 200;
