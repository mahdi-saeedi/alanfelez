-- Placeholder world prices for brass, iron and cast iron (client, 2026-11-02): made-up but close to the market, so
-- their charts show on the site while the client checks the look. The client voids them from the admin («قیمت‌ها و
-- ورود دستی» → history → «باطل کردن») once real prices are entered. 30 daily points each, US cents per ton:
-- brass ~ $6,800, iron (rebar) ~ $575, cast iron ~ $425. Only for a row that has no price at all, so real data is
-- never touched; a fresh database (rows seeded after the migrations) gets nothing.

-- +goose Up
INSERT INTO market.price_points (series_id, observed_at, price_minor, source_id, is_manual)
SELECT s.id,
       now() - d * interval '1 day',
       round(b.price * (1 + 0.03 * sin(d / 3.0) + 0.01 * cos(d * 1.7)))::bigint,
       (SELECT id FROM market.sources WHERE slug = 'manual'),
       true
FROM market.price_series s
JOIN (VALUES ('brass-yellow-global', 680000), ('rebar-16-global', 57500), ('cast-iron-scrap-global', 42500)) AS b (slug, price)
  ON b.slug = s.slug
CROSS JOIN generate_series(0, 29) AS d
WHERE NOT EXISTS (SELECT 1 FROM market.price_points p WHERE p.series_id = s.id)
  AND EXISTS (SELECT 1 FROM market.sources WHERE slug = 'manual');

INSERT INTO market.price_latest (series_id, point_id, price_minor, observed_at, source_id, prev_close_minor)
SELECT DISTINCT ON (p.series_id) p.series_id, p.id, p.price_minor, p.observed_at, p.source_id,
       (SELECT q.price_minor FROM market.price_points q
        WHERE q.series_id = p.series_id AND q.observed_at < p.observed_at - interval '12 hours'
        ORDER BY q.observed_at DESC LIMIT 1)
FROM market.price_points p
JOIN market.price_series s ON s.id = p.series_id
WHERE s.slug IN ('brass-yellow-global', 'rebar-16-global', 'cast-iron-scrap-global')
  AND p.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM market.price_latest l WHERE l.series_id = p.series_id)
ORDER BY p.series_id, p.observed_at DESC;

-- +goose Down
-- Nothing: staff void the placeholder points in the admin (an audited action), like any wrong price.
SELECT 1;
