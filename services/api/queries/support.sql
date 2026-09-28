-- Support (internal/support): contact form messages and user tickets.

-- name: InsertContactMessage :one
INSERT INTO app.contact_messages (name, phone, email, subject, body, user_id, ip, user_agent)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, created_at;

-- name: AdminListContactMessages :many
SELECT id, name, phone, email, subject, body, user_id, status, note, handled_at, created_at
FROM app.contact_messages
WHERE sqlc.narg(status)::text IS NULL OR status = sqlc.narg(status)::text
ORDER BY created_at DESC
LIMIT 200;

-- name: UpdateContactMessage :one
UPDATE app.contact_messages
SET status = sqlc.arg(status), note = sqlc.narg(note), handled_by = sqlc.arg(actor),
    handled_at = CASE WHEN sqlc.arg(status)::text = 'new' THEN NULL ELSE now() END
WHERE id = sqlc.arg(id)
RETURNING id, name, phone, email, subject, body, user_id, status, note, handled_at, created_at;

-- name: CreateTicket :one
-- Idempotent per user: the same key returns the ticket created the first time (inserted = false).
WITH ins AS (
  INSERT INTO app.tickets (user_id, subject, priority, idempotency_key)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id, number, user_id, subject, status, priority, last_message_at, closed_at, created_at
)
SELECT id, number, user_id, subject, status, priority, last_message_at, closed_at, created_at, true AS inserted FROM ins
UNION ALL
SELECT id, number, user_id, subject, status, priority, last_message_at, closed_at, created_at, false AS inserted
FROM app.tickets WHERE user_id = $1 AND idempotency_key = $4 AND NOT EXISTS (SELECT 1 FROM ins);

-- name: InsertTicketMessage :one
INSERT INTO app.ticket_messages (ticket_id, author_id, author_name, is_staff, body)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, ticket_id, author_name, is_staff, body, created_at;

-- name: GetTicket :one
SELECT t.id, t.number, t.user_id, t.subject, t.status, t.priority, t.last_message_at, t.closed_at, t.created_at,
       u.username, u.first_name, u.last_name
FROM app.tickets t JOIN app.users u ON u.id = t.user_id
WHERE t.id = $1;

-- name: GetTicketForUpdate :one
SELECT id, user_id, status FROM app.tickets WHERE id = $1 FOR UPDATE;

-- name: ListTicketMessages :many
SELECT id, ticket_id, author_name, is_staff, body, created_at FROM app.ticket_messages
WHERE ticket_id = $1 ORDER BY created_at, id;

-- name: SetTicketStatus :one
-- Also bumps last_message_at when a message was just added (touched = true).
UPDATE app.tickets
SET status = sqlc.arg(status),
    closed_at = CASE WHEN sqlc.arg(status)::text = 'closed' THEN now() ELSE NULL END,
    last_message_at = CASE WHEN sqlc.arg(touched)::boolean THEN now() ELSE last_message_at END
WHERE id = sqlc.arg(id)
RETURNING id, number, user_id, subject, status, priority, last_message_at, closed_at, created_at;

-- name: ListUserTickets :many
SELECT id, number, user_id, subject, status, priority, last_message_at, closed_at, created_at
FROM app.tickets WHERE user_id = $1 ORDER BY last_message_at DESC LIMIT 100;

-- name: AdminListTickets :many
-- The support queue: open tickets first (high priority, then oldest waiting), then the rest by activity.
SELECT t.id, t.number, t.user_id, t.subject, t.status, t.priority, t.last_message_at, t.closed_at, t.created_at,
       u.username, u.first_name, u.last_name
FROM app.tickets t JOIN app.users u ON u.id = t.user_id
WHERE (sqlc.narg(status)::text IS NULL OR t.status = sqlc.narg(status)::text)
  AND (sqlc.narg(user_id)::uuid IS NULL OR t.user_id = sqlc.narg(user_id)::uuid)
ORDER BY (t.status = 'open') DESC,
         CASE WHEN t.status = 'open' THEN (t.priority = 'high')::int ELSE 0 END DESC,
         CASE WHEN t.status = 'open' THEN t.last_message_at END ASC,
         t.last_message_at DESC
LIMIT 200;

-- name: SupportCounts :one
SELECT (SELECT count(*) FROM app.tickets WHERE status = 'open')::int AS open_tickets,
       (SELECT count(*) FROM app.contact_messages WHERE status = 'new')::int AS new_messages;
