-- +goose Up
-- Global prices for all 7 metals on the home page (client, 2026-10-25). LME doesn't trade iron, brass or cast iron,
-- so their global prices go under «بازار جهانی» (other global sources; the client will name them). Like LME, every
-- global market is free (00007): series in a market with scope 'global' are base series.
INSERT INTO market.markets (slug, name_fa, name_en, scope, sort)
VALUES ('global', 'بازار جهانی', 'Global market', 'global', 5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO market.price_series (slug, product_id, market_id, currency, unit, is_base, sort)
SELECT v.slug, p.id, m.id, 'USD', 'ton', true, v.sort
FROM (VALUES ('rebar-16-global', 'rebar-16', 160), ('brass-yellow-global', 'brass-yellow', 130), ('cast-iron-scrap-global', 'cast-iron-scrap', 170))
     AS v(slug, product, sort)
JOIN market.products p ON p.slug = v.product
JOIN market.markets m ON m.slug = 'global'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM market.price_series WHERE slug IN ('rebar-16-global', 'brass-yellow-global', 'cast-iron-scrap-global')
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = market.price_series.id);
DELETE FROM market.markets m WHERE m.slug = 'global'
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.market_id = m.id);
