-- Subscriptions and the audit log.

-- name: ActiveSubscription :one
-- The highest-ranked plan the user holds right now.
SELECT sub.id, sub.plan_code, sub.ends_at
FROM app.subscriptions sub
JOIN app.plans pl ON pl.code = sub.plan_code
WHERE sub.user_id = $1 AND sub.status = 'active' AND sub.starts_at <= now() AND sub.ends_at > now()
ORDER BY pl.rank DESC, sub.ends_at DESC
LIMIT 1;

-- name: InsertSubscription :one
INSERT INTO app.subscriptions (user_id, plan_code, starts_at, ends_at, origin, note, granted_by)
VALUES ($1, $2, $3, $4, 'manual', $5, $6)
RETURNING id, user_id, plan_code, starts_at, ends_at, status, origin, note;

-- name: ListSubscriptions :many
SELECT id, user_id, plan_code, starts_at, ends_at, status, origin, note
FROM app.subscriptions
WHERE sqlc.narg(user_id)::uuid IS NULL OR user_id = sqlc.narg(user_id)::uuid
ORDER BY starts_at DESC
LIMIT 100;

-- name: InsertAudit :exec
INSERT INTO app.audit_log (actor_id, actor_name, action, entity, entity_id, data, request_id)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: VisitSalt :one
-- The day's salt for anonymous visitor ids, made on first use.
WITH ins AS (
  INSERT INTO app.visit_salts (day) VALUES (sqlc.arg(day)::date) ON CONFLICT (day) DO NOTHING RETURNING salt
)
SELECT salt FROM ins UNION ALL SELECT vs.salt FROM app.visit_salts vs WHERE vs.day = sqlc.arg(day)::date LIMIT 1;

-- name: RecordVisit :exec
INSERT INTO app.daily_visits (day, visitor, user_id) VALUES (sqlc.arg(day)::date, sqlc.arg(visitor), sqlc.narg(user_id))
ON CONFLICT (day, visitor) DO UPDATE SET last_at = now(), pageviews = app.daily_visits.pageviews + 1;

-- name: VisitTotals :many
-- Per day since from: unique visitors, signed-in visitors and page views.
SELECT v.day, count(*)::int AS visitors, count(v.user_id)::int AS signed_in, sum(v.pageviews)::int AS pageviews
FROM app.daily_visits v
WHERE v.day >= sqlc.arg(since)::date
GROUP BY v.day
ORDER BY v.day DESC;

-- name: VisitUsers :many
-- The signed-in visitors of one day, with their name, mobile and the plan they hold now.
SELECT v.user_id::uuid AS user_id, u.username, u.phone_e164, u.first_name, u.last_name, v.first_at, v.last_at, v.pageviews,
       coalesce(cur.plan_code, 'free')::text AS current_plan
FROM app.daily_visits v
LEFT JOIN app.users u ON u.id = v.user_id
LEFT JOIN LATERAL (
  SELECT s.plan_code FROM app.subscriptions s JOIN app.plans p ON p.code = s.plan_code
  WHERE s.user_id = v.user_id AND s.status = 'active' AND s.starts_at <= now() AND s.ends_at > now()
  ORDER BY p.rank DESC LIMIT 1
) cur ON true
WHERE v.day = sqlc.arg(day)::date AND v.user_id IS NOT NULL
ORDER BY v.last_at DESC
LIMIT 500;

-- name: DeleteOldVisits :execrows
DELETE FROM app.daily_visits WHERE day < sqlc.arg(before)::date;

-- name: DeleteOldVisitSalts :execrows
DELETE FROM app.visit_salts WHERE day < sqlc.arg(before)::date;
