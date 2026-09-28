-- Subscriptions and the audit log.

-- name: ActiveSubscription :one
-- The highest-ranked plan the user holds right now.
SELECT sub.plan_code, sub.ends_at
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
ORDER BY created_at DESC
LIMIT 100;

-- name: InsertAudit :exec
INSERT INTO app.audit_log (actor_id, actor_name, action, entity, entity_id, data, request_id)
VALUES ($1, $2, $3, $4, $5, $6, $7);
