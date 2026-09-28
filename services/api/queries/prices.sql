-- Price series, points and latest prices (internal/prices). Money is minor units; time is UTC.

-- name: ListLatestPrices :many
-- One row per active series, with its latest published point (NULL when the series has no data yet).
SELECT s.id, s.slug, s.currency, s.unit, s.is_base, s.max_jump_bp, s.active,
       p.slug AS product_slug, p.name_fa AS product_fa, p.name_en AS product_en,
       m.slug AS metal_slug, m.name_fa AS metal_fa, m.name_en AS metal_en,
       c.slug AS category_slug, c.name_fa AS category_fa, c.name_en AS category_en,
       mk.slug AS market_slug, mk.name_fa AS market_fa, mk.name_en AS market_en, mk.scope AS market_scope,
       l.point_id, l.price_minor, l.observed_at, l.prev_close_minor,
       src.slug AS source_slug, src.provider AS source_provider, src.name_fa AS source_fa, src.name_en AS source_en
FROM market.price_series s
JOIN market.products p            ON p.id = s.product_id
JOIN market.metals m              ON m.id = p.metal_id
JOIN market.product_categories c  ON c.id = p.category_id
JOIN market.markets mk            ON mk.id = s.market_id
LEFT JOIN market.price_latest l   ON l.series_id = s.id
LEFT JOIN market.sources src      ON src.id = l.source_id
WHERE (s.active AND p.active) OR sqlc.arg(include_inactive)::boolean
ORDER BY m.sort, s.sort, s.slug;

-- name: GetSeriesBySlug :one
SELECT s.id, s.slug, s.currency, s.unit, s.is_base, s.max_jump_bp, s.active,
       p.slug AS product_slug, p.name_fa AS product_fa, p.name_en AS product_en,
       m.slug AS metal_slug, m.name_fa AS metal_fa, m.name_en AS metal_en,
       c.slug AS category_slug, c.name_fa AS category_fa, c.name_en AS category_en,
       mk.slug AS market_slug, mk.name_fa AS market_fa, mk.name_en AS market_en, mk.scope AS market_scope
FROM market.price_series s
JOIN market.products p            ON p.id = s.product_id
JOIN market.metals m              ON m.id = p.metal_id
JOIN market.product_categories c  ON c.id = p.category_id
JOIN market.markets mk            ON mk.id = s.market_id
WHERE s.slug = $1;

-- name: GetSeriesIDs :many
-- Resolves slugs for ingestion. Inactive series are included so the caller can report them.
SELECT id, slug, currency, unit, is_base, max_jump_bp, active FROM market.price_series WHERE slug = ANY(sqlc.arg(slugs)::text[]);

-- name: GetSeriesByID :one
SELECT id, slug, currency, unit, is_base, max_jump_bp, active FROM market.price_series WHERE id = $1;

-- name: SeriesPoints :many
-- Downsampled history: the last published price per bucket. Buckets are aligned to Tehran midnight so daily
-- buckets are calendar days in Iran.
SELECT (max(observed_at))::timestamptz AS t,
       ((array_agg(price_minor ORDER BY observed_at DESC))[1])::bigint AS price_minor
FROM market.price_points
WHERE series_id = sqlc.arg(series_id) AND status = 'published'
  AND observed_at >= sqlc.arg(since) AND observed_at <= sqlc.arg(until)
GROUP BY date_bin(make_interval(secs => sqlc.arg(bucket_seconds)::int), observed_at, '2000-01-01 00:00:00+03:30'::timestamptz)
ORDER BY t;

-- name: FirstPointAt :one
SELECT min(observed_at)::timestamptz FROM market.price_points WHERE series_id = $1 AND status = 'published';

-- name: CountPoints :one
SELECT count(*) FROM market.price_points WHERE series_id = $1;

-- Ingestion (always inside one transaction per batch) ---------------------------------------------------------

-- name: LockLatest :one
SELECT series_id, point_id, price_minor, observed_at, source_id, prev_close_minor
FROM market.price_latest WHERE series_id = $1 FOR UPDATE;

-- name: InsertPoint :one
-- ON CONFLICT DO NOTHING makes re-ingesting the same quote a no-op (no row returned).
INSERT INTO market.price_points (series_id, observed_at, price_minor, source_id, is_manual, entered_by, status)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (series_id, observed_at) DO NOTHING
RETURNING id, created_at;

-- name: UpsertLatest :exec
INSERT INTO market.price_latest (series_id, point_id, price_minor, observed_at, source_id, prev_close_minor, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, now())
ON CONFLICT (series_id) DO UPDATE SET
  point_id = EXCLUDED.point_id, price_minor = EXCLUDED.price_minor, observed_at = EXCLUDED.observed_at,
  source_id = EXCLUDED.source_id, prev_close_minor = EXCLUDED.prev_close_minor, updated_at = now();

-- name: LastCloseBefore :one
-- The last published price before a moment (used for prev_close when the latest point is replaced out of order).
SELECT price_minor FROM market.price_points
WHERE series_id = $1 AND status = 'published' AND observed_at < $2
ORDER BY observed_at DESC LIMIT 1;

-- Review of quarantined points -----------------------------------------------------------------------------

-- name: ListQuarantined :many
SELECT pp.id, s.slug AS series_slug, pp.price_minor, pp.observed_at, pp.status, pp.is_manual, pp.entered_by, pp.created_at,
       src.slug AS source_slug, l.price_minor AS latest_minor
FROM market.price_points pp
JOIN market.price_series s   ON s.id = pp.series_id
JOIN market.sources src      ON src.id = pp.source_id
LEFT JOIN market.price_latest l ON l.series_id = pp.series_id
WHERE pp.status = 'quarantined'
ORDER BY pp.created_at
LIMIT 200;

-- name: LockPoint :one
SELECT pp.id, pp.series_id, pp.price_minor, pp.observed_at, pp.status, pp.is_manual, pp.entered_by, pp.created_at,
       pp.source_id, s.slug AS series_slug, src.slug AS source_slug
FROM market.price_points pp
JOIN market.price_series s ON s.id = pp.series_id
JOIN market.sources src    ON src.id = pp.source_id
WHERE pp.id = $1
FOR UPDATE OF pp;

-- name: SetPointStatus :exec
UPDATE market.price_points SET status = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1;

-- Sources ----------------------------------------------------------------------------------------------------

-- name: ListSources :many
SELECT id, slug, name_fa, name_en, provider, config, fetch_interval_s, stale_after_s, active
FROM market.sources ORDER BY slug;

-- name: GetSourceBySlug :one
SELECT id, slug, name_fa, name_en, provider, config, fetch_interval_s, stale_after_s, active
FROM market.sources WHERE slug = $1;

-- name: InsertSourceRun :exec
INSERT INTO market.source_runs (source_id, started_at, finished_at, status, points, quarantined, error)
VALUES ($1, $2, now(), $3, $4, $5, $6);

-- name: SourceHealth :many
SELECT src.slug, src.name_fa, src.name_en, src.provider, src.active, src.fetch_interval_s, src.stale_after_s,
       lr.started_at AS last_run_at, COALESCE(lr.status, '')::text AS last_run_status, lr.error AS last_error,
       (SELECT max(r.started_at) FROM market.source_runs r WHERE r.source_id = src.id AND r.status = 'ok')::timestamptz AS last_success_at,
       (SELECT max(pp.created_at) FROM market.price_points pp WHERE pp.source_id = src.id)::timestamptz AS last_point_at
FROM market.sources src
LEFT JOIN LATERAL (
  SELECT r.started_at, r.status, r.error FROM market.source_runs r
  WHERE r.source_id = src.id ORDER BY r.started_at DESC LIMIT 1
) lr ON true
ORDER BY src.slug;

-- name: DeleteOldSourceRuns :execrows
DELETE FROM market.source_runs WHERE started_at < $1;

-- name: SourceHasPoints :one
SELECT EXISTS (SELECT 1 FROM market.price_points WHERE source_id = $1);

-- name: LatestPriceBySlug :many
SELECT s.slug, l.price_minor FROM market.price_latest l JOIN market.price_series s ON s.id = l.series_id;
