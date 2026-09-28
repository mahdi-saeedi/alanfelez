-- Gold features: IME daily offerings, saved calculations, SMS price alerts.

-- name: ImeDates :many
-- The most recent trading days that have offerings (for the date picker).
SELECT DISTINCT trade_date FROM market.ime_offerings ORDER BY trade_date DESC LIMIT 60;

-- name: ListImeOfferings :many
SELECT o.id, o.trade_date, m.slug AS metal_slug, m.name_fa AS metal_fa, m.name_en AS metal_en,
       o.product_fa, o.product_en, o.producer_fa, o.producer_en, o.offered_kg, o.base_price_rial,
       o.demand_kg, o.traded_kg, o.clearing_price_rial, o.source, o.updated_at
FROM market.ime_offerings o JOIN market.metals m ON m.id = o.metal_id
WHERE o.trade_date = sqlc.arg(trade_date)::date
  AND (sqlc.narg(metal)::text IS NULL OR m.slug = sqlc.narg(metal)::text)
ORDER BY m.sort, o.product_fa, o.producer_fa;

-- name: UpsertImeOffering :one
-- The natural key is (day, product, producer): re-entering a row corrects it.
INSERT INTO market.ime_offerings (trade_date, metal_id, product_fa, product_en, producer_fa, producer_en, offered_kg,
                                  base_price_rial, demand_kg, traded_kg, clearing_price_rial, source, entered_by)
VALUES (sqlc.arg(trade_date), (SELECT mm.id FROM market.metals mm WHERE mm.slug = sqlc.arg(metal_slug)::text),
        sqlc.arg(product_fa), sqlc.narg(product_en), sqlc.arg(producer_fa), sqlc.narg(producer_en), sqlc.arg(offered_kg),
        sqlc.arg(base_price_rial), sqlc.narg(demand_kg), sqlc.narg(traded_kg), sqlc.narg(clearing_price_rial),
        sqlc.arg(source), sqlc.narg(entered_by))
ON CONFLICT (trade_date, product_fa, producer_fa) DO UPDATE SET
  metal_id = EXCLUDED.metal_id, product_en = EXCLUDED.product_en, producer_en = EXCLUDED.producer_en,
  offered_kg = EXCLUDED.offered_kg, base_price_rial = EXCLUDED.base_price_rial, demand_kg = EXCLUDED.demand_kg,
  traded_kg = EXCLUDED.traded_kg, clearing_price_rial = EXCLUDED.clearing_price_rial, source = EXCLUDED.source,
  entered_by = EXCLUDED.entered_by
RETURNING id, (xmax = 0) AS inserted;

-- name: DeleteImeOffering :one
DELETE FROM market.ime_offerings WHERE id = $1 RETURNING trade_date, product_fa, producer_fa;

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

-- name: ImeUpdatedAt :one
SELECT max(updated_at)::timestamptz FROM market.ime_offerings WHERE trade_date = $1;
