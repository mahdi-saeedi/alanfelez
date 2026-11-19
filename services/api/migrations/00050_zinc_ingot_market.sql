-- +goose Up
-- The client (2026-11-19): zinc ingot in «بازار» too, in two purities, as a group of its own («شمش روی»). Additive only.
INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, 'شمش روی', 'Zinc ingot', 10
FROM market.metals m JOIN market.product_categories c ON c.slug = 'intermediate'
WHERE m.slug = 'zinc'
ON CONFLICT (metal_id, category_id, name_fa) DO NOTHING;

-- One statement (no temporary table, which sqlc would read as a model): the products, then their price rows.
WITH n (slug, name_fa, sort) AS (VALUES
  ('zinc-ingot-99p97', 'شمش روی با خلوص 99.97%', 405),
  ('zinc-ingot-99p98', 'شمش روی با خلوص 99.98%', 406)),
p AS (
  INSERT INTO market.products (slug, metal_id, category_id, name_fa, sort, group_id)
  SELECT n.slug, m.id, c.id, n.name_fa, n.sort, g.id
  FROM n
  JOIN market.metals m ON m.slug = 'zinc'
  JOIN market.product_categories c ON c.slug = 'intermediate'
  LEFT JOIN market.product_groups g ON g.metal_id = m.id AND g.category_id = c.id AND g.name_fa = 'شمش روی'
  ON CONFLICT (slug) DO NOTHING
  RETURNING id, slug
)
INSERT INTO market.price_series (slug, product_id, market_id, currency, unit, is_base, sort)
SELECT n.slug || '-free', p.id, mk.id, 'IRR', 'kg', false, n.sort
FROM n
JOIN p ON p.slug = n.slug
JOIN market.markets mk ON mk.slug = 'free'
ON CONFLICT DO NOTHING;

-- +goose Down
-- Only rows that never got a price.
DELETE FROM market.price_series s USING market.products p
WHERE s.product_id = p.id AND p.slug IN ('zinc-ingot-99p97', 'zinc-ingot-99p98')
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id);
DELETE FROM market.products p
WHERE p.slug IN ('zinc-ingot-99p97', 'zinc-ingot-99p98')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.product_id = p.id);
DELETE FROM market.product_groups g USING market.metals m
WHERE g.metal_id = m.id AND m.slug = 'zinc' AND g.name_fa = 'شمش روی'
  AND NOT EXISTS (SELECT 1 FROM market.products p WHERE p.group_id = g.id);
