-- Sales follow-up (admin), call lists and the sales report. Migration 00030.

-- name: GetSalesLead :one
SELECT l.user_id, l.stage, l.owner_id, l.owner_name, l.next_at, l.updated_at, l.updated_by
FROM app.sales_leads l WHERE l.user_id = sqlc.arg(user_id);

-- name: UpsertSalesLead :one
INSERT INTO app.sales_leads (user_id, stage, owner_id, owner_name, next_at, updated_by)
VALUES (sqlc.arg(user_id), sqlc.arg(stage), sqlc.narg(owner_id), sqlc.narg(owner_name), sqlc.narg(next_at)::date, sqlc.arg(updated_by))
ON CONFLICT (user_id) DO UPDATE SET stage = excluded.stage, owner_id = excluded.owner_id, owner_name = excluded.owner_name,
  next_at = excluded.next_at, updated_by = excluded.updated_by, updated_at = now()
RETURNING user_id, stage, owner_id, owner_name, next_at, updated_at, updated_by;

-- name: ListSalesNotes :many
SELECT n.id, n.kind, n.outcome, n.body, n.author_name, n.created_at
FROM app.sales_notes n WHERE n.user_id = sqlc.arg(user_id)
ORDER BY n.created_at DESC
LIMIT 200;

-- name: InsertSalesNote :one
INSERT INTO app.sales_notes (user_id, author_id, author_name, kind, outcome, body)
VALUES (sqlc.arg(user_id), sqlc.arg(author_id), sqlc.arg(author_name), sqlc.arg(kind), sqlc.narg(outcome), sqlc.arg(body))
RETURNING id, kind, outcome, body, author_name, created_at;

-- name: UserExists :one
SELECT EXISTS (SELECT 1 FROM app.users u WHERE u.id = sqlc.arg(id) AND u.deleted_at IS NULL)::bool;

-- name: SalesFollowups :many
-- Customers whose next follow-up is due by the given day (overdue first), optionally only one staff member's.
SELECT l.user_id, l.stage, l.owner_name, l.next_at, u.username, u.first_name, u.last_name, u.company,
       coalesce(cur.plan_code, 'free')::text AS current_plan,
       coalesce(last.kind, '')::text AS last_kind, last.outcome AS last_outcome, coalesce(last.body, '')::text AS last_body, last.created_at AS last_at
FROM app.sales_leads l
JOIN app.users u ON u.id = l.user_id AND u.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT s.plan_code FROM app.subscriptions s JOIN app.plans p ON p.code = s.plan_code
  WHERE s.user_id = u.id AND s.status = 'active' AND s.starts_at <= now() AND s.ends_at > now()
  ORDER BY p.rank DESC LIMIT 1
) cur ON true
LEFT JOIN LATERAL (
  SELECT n.kind, n.outcome, n.body, n.created_at FROM app.sales_notes n WHERE n.user_id = l.user_id ORDER BY n.created_at DESC LIMIT 1
) last ON true
WHERE l.next_at IS NOT NULL AND l.next_at <= sqlc.arg(day)::date
  AND (sqlc.narg(owner_id)::uuid IS NULL OR l.owner_id = sqlc.narg(owner_id)::uuid)
ORDER BY l.next_at, u.username
LIMIT 500;

-- name: CountFollowupsDue :one
SELECT count(*)::int FROM app.sales_leads l JOIN app.users u ON u.id = l.user_id AND u.deleted_at IS NULL
WHERE l.next_at IS NOT NULL AND l.next_at <= sqlc.arg(day)::date;

-- name: RenewalCalls :many
-- Paid plans (Silver, Gold) ending between from_at and to_at that nothing continues (no later active plan starting by
-- then): the renewal call list. last_call = the latest renewal call in the 30 days before the end.
SELECT s.id AS subscription_id, s.user_id, s.plan_code, s.starts_at, s.ends_at, (s.order_id IS NOT NULL)::bool AS paid,
       u.username, u.first_name, u.last_name, u.company, coalesce(l.stage, '')::text AS stage, l.owner_name,
       c.outcome AS call_outcome, coalesce(c.body, '')::text AS call_body, c.created_at AS call_at, coalesce(c.author_name, '')::text AS call_by
FROM app.subscriptions s
JOIN app.users u ON u.id = s.user_id AND u.deleted_at IS NULL
LEFT JOIN app.sales_leads l ON l.user_id = s.user_id
LEFT JOIN LATERAL (
  SELECT n.outcome, n.body, n.created_at, n.author_name FROM app.sales_notes n
  WHERE n.user_id = s.user_id AND n.kind = 'renewal_call' AND n.created_at > s.ends_at - interval '30 days'
  ORDER BY n.created_at DESC LIMIT 1
) c ON true
WHERE s.status = 'active' AND s.plan_code IN ('silver', 'gold')
  AND s.ends_at >= sqlc.arg(from_at)::timestamptz AND s.ends_at < sqlc.arg(to_at)::timestamptz
  AND NOT EXISTS (SELECT 1 FROM app.subscriptions n WHERE n.user_id = s.user_id AND n.status = 'active'
                  AND n.id <> s.id AND n.ends_at > s.ends_at AND n.starts_at <= s.ends_at)
ORDER BY s.ends_at
LIMIT 500;

-- name: FeedbackCalls :many
-- Plans (Silver, Gold) that started between from_at and to_at: the "how is it going?" call list. last_call = the
-- latest feedback call since the plan started.
SELECT s.id AS subscription_id, s.user_id, s.plan_code, s.starts_at, s.ends_at, (s.order_id IS NOT NULL)::bool AS paid,
       u.username, u.first_name, u.last_name, u.company, coalesce(l.stage, '')::text AS stage, l.owner_name,
       c.outcome AS call_outcome, coalesce(c.body, '')::text AS call_body, c.created_at AS call_at, coalesce(c.author_name, '')::text AS call_by
FROM app.subscriptions s
JOIN app.users u ON u.id = s.user_id AND u.deleted_at IS NULL
LEFT JOIN app.sales_leads l ON l.user_id = s.user_id
LEFT JOIN LATERAL (
  SELECT n.outcome, n.body, n.created_at, n.author_name FROM app.sales_notes n
  WHERE n.user_id = s.user_id AND n.kind = 'feedback_call' AND n.created_at >= s.starts_at
  ORDER BY n.created_at DESC LIMIT 1
) c ON true
WHERE s.status IN ('active', 'replaced') AND s.plan_code IN ('silver', 'gold')
  AND s.starts_at >= sqlc.arg(from_at)::timestamptz AND s.starts_at < sqlc.arg(to_at)::timestamptz
ORDER BY s.starts_at
LIMIT 500;

-- name: SalesOrders :many
-- Orders paid between from_at and to_at (refunded ones included: the refund is reported on its own day).
SELECT o.id, o.user_id, o.plan_code, o.period, o.kind, o.price_rial, o.credit_rial, o.amount_rial, o.status, o.paid_at::timestamptz AS paid_at,
       u.username
FROM app.orders o
LEFT JOIN app.users u ON u.id = o.user_id
WHERE o.paid_at IS NOT NULL AND o.status IN ('paid', 'refunded')
  AND o.paid_at >= sqlc.arg(from_at)::timestamptz AND o.paid_at < sqlc.arg(to_at)::timestamptz
ORDER BY o.paid_at
LIMIT 50000;

-- name: SalesRefunds :many
-- Refunds approved between from_at and to_at.
SELECT r.id, r.order_id, r.amount_rial, r.decided_at::timestamptz AS decided_at, o.plan_code
FROM app.refunds r JOIN app.orders o ON o.id = r.order_id
WHERE r.status = 'approved' AND r.decided_at >= sqlc.arg(from_at)::timestamptz AND r.decided_at < sqlc.arg(to_at)::timestamptz
ORDER BY r.decided_at
LIMIT 50000;
