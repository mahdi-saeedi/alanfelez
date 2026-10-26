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

-- name: PriceAround :one
-- The published price nearest to a moment, for the outlier gate of a back-dated quote: the last one before it, or
-- (when there is none) the first one after it. No row = the series has no published price at all.
SELECT price_minor FROM (
  (SELECT pp.price_minor, 0 AS side FROM market.price_points pp
   WHERE pp.series_id = sqlc.arg(series_id) AND pp.status = 'published' AND pp.observed_at < sqlc.arg(at)
   ORDER BY pp.observed_at DESC LIMIT 1)
  UNION ALL
  (SELECT pp.price_minor, 1 AS side FROM market.price_points pp
   WHERE pp.series_id = sqlc.arg(series_id) AND pp.status = 'published' AND pp.observed_at > sqlc.arg(at)
   ORDER BY pp.observed_at ASC LIMIT 1)
) around ORDER BY side LIMIT 1;

-- name: AdminPricesAt :many
-- The price of every series at a moment: its last published point at or before it (the admin's "prices on a date").
SELECT DISTINCT ON (pp.series_id) s.slug AS series_slug, pp.id, pp.price_minor, pp.observed_at, pp.is_manual
FROM market.price_points pp
JOIN market.price_series s ON s.id = pp.series_id
WHERE pp.status = 'published' AND pp.observed_at <= sqlc.arg(at)
ORDER BY pp.series_id, pp.observed_at DESC;

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

-- Price history and voiding (admin) ------------------------------------------------------------------------

-- name: AdminSeriesPoints :many
-- Recent points of one series in every status, newest first, with the staff names from the audit log and the
-- published price before each point (so the admin can show "from → to").
SELECT pp.id, pp.price_minor, pp.observed_at, pp.status, pp.is_manual, pp.entered_by, pp.created_at, pp.reviewed_at,
       src.slug AS source_slug,
       COALESCE((SELECT a.actor_name FROM app.audit_log a
                 WHERE a.entity = 'price_point' AND a.entity_id = pp.id::text AND a.action = 'price.manual_entry'
                 ORDER BY a.at LIMIT 1), '')::text AS entered_by_name,
       COALESCE((SELECT a.actor_name FROM app.audit_log a
                 WHERE a.entity = 'price_point' AND a.entity_id = pp.id::text
                   AND a.action IN ('price.approve', 'price.reject', 'price.void')
                 ORDER BY a.at DESC LIMIT 1), '')::text AS reviewed_by_name,
       COALESCE((SELECT prev.price_minor FROM market.price_points prev
                 WHERE prev.series_id = pp.series_id AND prev.status = 'published' AND prev.observed_at < pp.observed_at
                 ORDER BY prev.observed_at DESC LIMIT 1), 0)::bigint AS previous_minor
FROM market.price_points pp
JOIN market.sources src ON src.id = pp.source_id
WHERE pp.series_id = sqlc.arg(series_id)
ORDER BY pp.observed_at DESC
LIMIT sqlc.arg(max_rows);

-- name: LatestPublishedPoint :one
-- After a void: the newest published point that is left becomes the latest price.
SELECT id, price_minor, observed_at, source_id FROM market.price_points
WHERE series_id = $1 AND status = 'published'
ORDER BY observed_at DESC LIMIT 1;

-- name: DeleteLatest :exec
DELETE FROM market.price_latest WHERE series_id = $1;

-- Catalog (admin): metals, products, series ------------------------------------------------------------------

-- name: AdminListMetals :many
SELECT slug, name_fa, name_en FROM market.metals ORDER BY sort, slug;

-- name: AdminListProducts :many
SELECT p.slug, m.slug AS metal_slug, c.slug AS category_slug, p.name_fa, p.name_en, p.active
FROM market.products p
JOIN market.metals m             ON m.id = p.metal_id
JOIN market.product_categories c ON c.id = p.category_id
ORDER BY m.sort, p.sort, p.slug;

-- name: AdminListCategories :many
SELECT slug, name_fa, name_en FROM market.product_categories ORDER BY sort, slug;

-- name: AdminListMarkets :many
SELECT slug, name_fa, name_en FROM market.markets ORDER BY sort, slug;

-- name: InsertMetal :one
-- No row back = the slug is taken.
INSERT INTO market.metals (slug, name_fa, name_en, sort)
VALUES (sqlc.arg(slug), sqlc.arg(name_fa), sqlc.narg(name_en), (SELECT COALESCE(max(sort), 0) + 1 FROM market.metals))
ON CONFLICT (slug) DO NOTHING
RETURNING slug, name_fa, name_en;

-- name: InsertProduct :one
-- No row back = the slug is taken, or the metal or category doesn't exist (the handler tells which).
INSERT INTO market.products (slug, metal_id, category_id, name_fa, name_en, sort)
SELECT sqlc.arg(slug), m.id, c.id, sqlc.arg(name_fa), sqlc.narg(name_en),
       (SELECT COALESCE(max(sort), 0) + 1 FROM market.products)
FROM market.metals m, market.product_categories c
WHERE m.slug = sqlc.arg(metal) AND c.slug = sqlc.arg(category)
ON CONFLICT (slug) DO NOTHING
RETURNING id;

-- name: InsertSeries :one
-- New series are base (free) in global markets (LME, «بازار جهانی») and on the IME (بورس کالا): the client's plan
-- table (2026-10-26). Domestic day prices (free market, Iran iron market) are Silver and Gold.
-- No row back = the slug or the product × market × currency × unit combination is taken, or a reference is unknown.
INSERT INTO market.price_series (slug, product_id, market_id, currency, unit, is_base, max_jump_bp, sort)
SELECT sqlc.arg(slug), p.id, mk.id, sqlc.arg(currency), sqlc.arg(unit), (mk.scope = 'global' OR mk.slug = 'ime'), sqlc.arg(max_jump_bp),
       (SELECT COALESCE(max(sort), 0) + 1 FROM market.price_series)
FROM market.products p, market.markets mk
WHERE p.slug = sqlc.arg(product) AND mk.slug = sqlc.arg(market)
ON CONFLICT DO NOTHING
RETURNING id;

-- name: CatalogRefsExist :one
-- Which references of a new product or series exist (to answer 404 rather than 409).
SELECT EXISTS (SELECT 1 FROM market.metals m WHERE m.slug = sqlc.arg(metal))                AS metal,
       EXISTS (SELECT 1 FROM market.product_categories c WHERE c.slug = sqlc.arg(category)) AS category,
       EXISTS (SELECT 1 FROM market.products p WHERE p.slug = sqlc.arg(product))            AS product,
       EXISTS (SELECT 1 FROM market.markets mk WHERE mk.slug = sqlc.arg(market))           AS market;

-- name: SetProductActive :execrows
UPDATE market.products SET active = $2, updated_at = now() WHERE slug = $1;

-- name: SetSeriesActive :execrows
UPDATE market.price_series SET active = $2, updated_at = now() WHERE slug = $1;

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
