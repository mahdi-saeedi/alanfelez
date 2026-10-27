-- Gold features: metal auctions, saved calculations, SMS price alerts.

-- name: ListAuctions :many
-- Metal auctions, newest first, with optional filters. total is the count of all matching rows (for paging).
SELECT a.id, a.title_fa, a.title_en, m.slug AS metal_slug, m.name_fa AS metal_fa, m.name_en AS metal_en, a.category,
       a.quantity, a.unit, a.status, a.deadline_at, a.location_fa, a.location_en, a.organizer_fa, a.organizer_en,
       a.details_fa, a.details_en, a.created_at, a.updated_at,
       f.file_name AS pdf_name, f.size_bytes AS pdf_size, count(*) OVER () AS total
FROM market.auctions a
JOIN market.metals m ON m.id = a.metal_id
LEFT JOIN market.auction_files f ON f.auction_id = a.id
WHERE (sqlc.narg(metal)::text IS NULL OR m.slug = sqlc.narg(metal)::text)
  AND (sqlc.narg(category)::text IS NULL OR a.category = sqlc.narg(category)::text)
  AND (sqlc.narg(status)::text IS NULL OR a.status = sqlc.narg(status)::text)
ORDER BY a.created_at DESC, a.id
LIMIT sqlc.arg(lim) OFFSET sqlc.arg(off);

-- name: InsertAuction :one
INSERT INTO market.auctions (title_fa, title_en, metal_id, category, quantity, unit, status, deadline_at,
                             location_fa, location_en, organizer_fa, organizer_en, details_fa, details_en, created_by)
VALUES (sqlc.arg(title_fa), sqlc.narg(title_en), (SELECT mm.id FROM market.metals mm WHERE mm.slug = sqlc.arg(metal_slug)::text),
        sqlc.arg(category), sqlc.arg(quantity), sqlc.arg(unit), sqlc.arg(status), sqlc.narg(deadline_at),
        sqlc.narg(location_fa), sqlc.narg(location_en), sqlc.narg(organizer_fa), sqlc.narg(organizer_en),
        sqlc.narg(details_fa), sqlc.narg(details_en), sqlc.narg(created_by))
RETURNING id;

-- name: UpdateAuction :execrows
UPDATE market.auctions a SET
  title_fa = sqlc.arg(title_fa), title_en = sqlc.narg(title_en),
  metal_id = (SELECT mm.id FROM market.metals mm WHERE mm.slug = sqlc.arg(metal_slug)::text),
  category = sqlc.arg(category), quantity = sqlc.arg(quantity), unit = sqlc.arg(unit), status = sqlc.arg(status),
  deadline_at = sqlc.narg(deadline_at), location_fa = sqlc.narg(location_fa), location_en = sqlc.narg(location_en),
  organizer_fa = sqlc.narg(organizer_fa), organizer_en = sqlc.narg(organizer_en),
  details_fa = sqlc.narg(details_fa), details_en = sqlc.narg(details_en), updated_at = now()
WHERE a.id = sqlc.arg(id);

-- name: DeleteAuction :one
DELETE FROM market.auctions WHERE id = $1 RETURNING title_fa;

-- name: PutAuctionFile :execrows
-- Adds or replaces the auction's PDF notice (0 rows: no such auction).
INSERT INTO market.auction_files (auction_id, file_name, size_bytes, content, uploaded_by)
SELECT a.id, sqlc.arg(file_name), sqlc.arg(size_bytes), sqlc.arg(content), sqlc.narg(uploaded_by)
FROM market.auctions a WHERE a.id = sqlc.arg(auction_id)
ON CONFLICT (auction_id) DO UPDATE SET
  file_name = EXCLUDED.file_name, size_bytes = EXCLUDED.size_bytes, content = EXCLUDED.content,
  uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now();

-- name: DeleteAuctionFile :execrows
DELETE FROM market.auction_files WHERE auction_id = $1;

-- name: GetAuctionFile :one
SELECT f.file_name, f.content, f.uploaded_at FROM market.auction_files f WHERE f.auction_id = $1;

-- name: InsertCalculation :one
INSERT INTO app.calculations (user_id, name, series_id, input, result)
VALUES ($1, $2, (SELECT ps.id FROM market.price_series ps WHERE ps.slug = sqlc.narg(series_slug)::text), $3, $4)
RETURNING id, created_at;

-- name: ListCalculations :many
SELECT c.id, c.name, s.slug AS series_slug, c.input, c.result, c.created_at
FROM app.calculations c LEFT JOIN market.price_series s ON s.id = c.series_id
WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 50;

-- name: CountCalculations :one
SELECT count(*)::int FROM app.calculations WHERE user_id = $1;

-- name: DeleteCalculation :execrows
DELETE FROM app.calculations WHERE id = $1 AND user_id = $2;

-- name: ListUserAlerts :many
SELECT a.id, s.slug AS series_slug, s.currency, s.unit, p.name_fa AS product_fa, p.name_en AS product_en,
       a.kind, a.threshold_minor, a.move_bp, a.active, a.last_triggered_at, a.created_at
FROM app.price_alerts a
JOIN market.price_series s ON s.id = a.series_id
JOIN market.products p ON p.id = s.product_id
WHERE a.user_id = $1 ORDER BY a.created_at DESC;

-- name: CountUserAlerts :one
SELECT count(*)::int FROM app.price_alerts WHERE user_id = $1;

-- name: InsertAlert :one
INSERT INTO app.price_alerts (user_id, series_id, kind, threshold_minor, move_bp)
VALUES (sqlc.arg(user_id), (SELECT ps.id FROM market.price_series ps WHERE ps.slug = sqlc.arg(series_slug)::text AND ps.active),
        sqlc.arg(kind), sqlc.narg(threshold_minor), sqlc.narg(move_bp))
RETURNING id, created_at;

-- name: SetAlertActive :execrows
-- Re-activating re-arms the alert, so it fires on the next crossing.
UPDATE app.price_alerts SET active = sqlc.arg(active), armed = CASE WHEN sqlc.arg(active)::boolean THEN true ELSE armed END
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id);

-- name: DeleteAlert :execrows
DELETE FROM app.price_alerts WHERE id = $1 AND user_id = $2;

-- name: AlertCandidates :many
-- Active alerts on series that have a price, with what the SMS needs. The worker checks the user's plan in Go
-- (internal/access), so a lapsed Gold plan simply stops sending.
SELECT a.id, a.user_id, a.kind, a.threshold_minor, a.move_bp, a.armed, a.last_triggered_at,
       s.slug AS series_slug, s.currency, s.unit, p.name_fa AS product_fa, p.name_en AS product_en,
       l.price_minor, l.prev_close_minor, l.observed_at,
       u.phone_e164, u.locale
FROM app.price_alerts a
JOIN market.price_series s ON s.id = a.series_id AND s.active
JOIN market.products p ON p.id = s.product_id
JOIN market.price_latest l ON l.series_id = a.series_id
JOIN app.users u ON u.id = a.user_id AND u.phone_e164 IS NOT NULL AND u.blocked_at IS NULL
WHERE a.active
ORDER BY a.user_id, a.created_at;

-- name: MarkAlert :exec
-- armed = false after firing (above / below); triggered = true stamps last_triggered_at.
UPDATE app.price_alerts
SET armed = sqlc.arg(armed), last_triggered_at = CASE WHEN sqlc.arg(triggered)::boolean THEN now() ELSE last_triggered_at END
WHERE id = sqlc.arg(id);

-- name: AlertsSentSince :one
-- Price-alert SMS sent to a user since a time (the per-user daily cap).
SELECT count(*)::int FROM app.notifications
WHERE user_id = $1 AND template LIKE 'price_alert_%' AND status = 'sent' AND created_at >= sqlc.arg(since);

-- name: SMSCostSince :one
-- Total SMS spend since a time (the daily budget circuit breaker, SECURITY §4).
SELECT coalesce(sum(cost_rial), 0)::bigint FROM app.notifications WHERE status = 'sent' AND created_at >= sqlc.arg(since);

-- name: GetLatestPrice :one
-- The calculator's base price: the latest published point of one series, with its source.
SELECT l.price_minor, l.observed_at, src.name_fa AS source_fa, src.name_en AS source_en,
       mk.name_fa AS market_fa, mk.name_en AS market_en
FROM market.price_latest l
JOIN market.sources src ON src.id = l.source_id
JOIN market.price_series s ON s.id = l.series_id
JOIN market.markets mk ON mk.id = s.market_id
WHERE l.series_id = $1;

-- name: GetSmsPrefs :one
SELECT m.slug AS metal_slug, p.enabled FROM app.sms_prefs p LEFT JOIN market.metals m ON m.id = p.metal_id WHERE p.user_id = $1;

-- name: UpsertSmsPrefs :execrows
-- 0 rows: unknown metal slug.
INSERT INTO app.sms_prefs (user_id, metal_id, enabled)
SELECT sqlc.arg(user_id), mm.id, sqlc.arg(enabled) FROM market.metals mm WHERE mm.slug = sqlc.arg(metal_slug)::text
ON CONFLICT (user_id) DO UPDATE SET metal_id = EXCLUDED.metal_id, enabled = EXCLUDED.enabled, updated_at = now();

-- name: InitPriceUpdateCursors :exec
-- New metals start "announced up to now", so the first run never sends old changes.
INSERT INTO app.price_update_cursor (metal_id, notified_through) SELECT m.id, now() FROM market.metals m
ON CONFLICT (metal_id) DO NOTHING;

-- name: MetalPriceChanges :many
-- Per metal: domestic latest prices (not global) that changed after the metal's cursor, the last change and how many.
SELECT m.id AS metal_id, m.name_fa AS metal_fa, m.name_en AS metal_en,
       max(l.updated_at)::timestamptz AS last_change, count(*)::int AS changed
FROM market.price_latest l
JOIN market.price_series s ON s.id = l.series_id AND s.active
JOIN market.markets mk ON mk.id = s.market_id AND mk.scope = 'domestic'
JOIN market.products p ON p.id = s.product_id
JOIN market.metals m ON m.id = p.metal_id
JOIN app.price_update_cursor c ON c.metal_id = m.id
WHERE l.updated_at > c.notified_through
GROUP BY m.id, m.name_fa, m.name_en;

-- name: SetPriceUpdateCursor :exec
UPDATE app.price_update_cursor SET notified_through = sqlc.arg(through) WHERE metal_id = sqlc.arg(metal_id);

-- name: MetalSmsSubscribers :many
-- Users who chose this metal and have SMS on, with a phone. Their plan is checked in Go (internal/access).
SELECT u.id AS user_id, u.phone_e164, u.locale, p.metal_id
FROM app.sms_prefs p
JOIN app.users u ON u.id = p.user_id AND u.phone_e164 IS NOT NULL AND u.blocked_at IS NULL
WHERE p.enabled AND p.metal_id IS NOT NULL AND (sqlc.narg(metal_id)::smallint IS NULL OR p.metal_id = sqlc.narg(metal_id)::smallint);

-- name: BigDailyMoves :many
-- Domestic latest prices that moved at least min_bp (either way) against the previous day's close.
SELECT s.id AS series_id, s.slug AS series_slug, s.currency, s.unit, pr.metal_id, pr.name_fa AS product_fa, pr.name_en AS product_en,
       l.price_minor, l.prev_close_minor::bigint AS prev_close_minor
FROM market.price_latest l
JOIN market.price_series s ON s.id = l.series_id AND s.active
JOIN market.markets mk ON mk.id = s.market_id AND mk.scope = 'domestic'
JOIN market.products pr ON pr.id = s.product_id
WHERE l.prev_close_minor IS NOT NULL AND l.prev_close_minor > 0
  AND abs(l.price_minor - l.prev_close_minor) * 10000 >= sqlc.arg(min_bp)::bigint * l.prev_close_minor;

-- name: NotificationsSentSince :one
-- SMS of one template sent to a user since a time (daily caps).
SELECT count(*)::int FROM app.notifications
WHERE user_id = $1 AND template = sqlc.arg(template) AND status = 'sent' AND created_at >= sqlc.arg(since);

-- name: UncoveredPriceChanges :one
-- How many of a metal's changed domestic prices (since its cursor) the user hasn't had a move alert for since that
-- change: a product whose ±10 % alert already went out isn't announced again in "prices updated" (client, 2026-10-27).
SELECT count(*)::int
FROM market.price_latest l
JOIN market.price_series s ON s.id = l.series_id AND s.active
JOIN market.markets mk ON mk.id = s.market_id AND mk.scope = 'domestic'
JOIN market.products p ON p.id = s.product_id AND p.metal_id = sqlc.arg(metal_id)
JOIN app.price_update_cursor c ON c.metal_id = p.metal_id
WHERE l.updated_at > c.notified_through
  AND NOT EXISTS (
    SELECT 1 FROM app.notifications n
    WHERE n.user_id = sqlc.arg(user_id) AND n.template = 'price_move' AND n.status = 'sent'
      AND n.dedupe_key LIKE 'price_move:' || sqlc.arg(user_id)::text || ':' || s.id || ':%'
      AND n.created_at >= l.updated_at);
