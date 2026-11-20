-- +goose Up
-- The client's cast iron list (2026-11-20, an Excel file). No raw materials in the file. Two parts:
--   * «بازار»: a group «شمش چدن» with the file's four ingots; «شمش چدن خام» and «شمش چدن کوره بلند» are added here,
--     «خاکستری» and «داکتیل» are the existing rows renamed into the group (00056, so their prices stay);
--   * the IME: the client's export covers a year (cast iron is offered on no fixed days) and every one of its 24 trades
--     is the same symbol, ESC-CIB-00 «شمش چدن» of ذوب آهن اصفهان: one product, «شمش چدن (ذوب آهن اصفهان)».
-- Additive only (ON CONFLICT DO NOTHING); a row appears on the site once it has a price. Nothing happens on a fresh
-- database.
INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, 'شمش چدن', 'Cast iron ingot', 10
FROM market.metals m JOIN market.product_categories c ON c.slug = 'intermediate'
WHERE m.slug = 'cast-iron'
ON CONFLICT (metal_id, category_id, name_fa) DO NOTHING;

-- One statement (no temporary table, which sqlc would read as a model): the products, then their price rows.
WITH n (slug, name_fa, group_fa, market, is_base, sort) AS (VALUES
  ('cast-iron-ingot-raw', 'شمش چدن خام', 'شمش چدن', 'free', false, 412),
  ('cast-iron-ingot-blast-furnace', 'شمش چدن کوره بلند', 'شمش چدن', 'free', false, 413),
  ('cast-iron-ime-esc-cib', 'شمش چدن (ذوب آهن اصفهان)', NULL, 'ime', true, 380)),
p AS (
  INSERT INTO market.products (slug, metal_id, category_id, name_fa, sort, group_id)
  SELECT n.slug, m.id, c.id, n.name_fa, n.sort, g.id
  FROM n
  JOIN market.metals m ON m.slug = 'cast-iron'
  JOIN market.product_categories c ON c.slug = 'intermediate'
  LEFT JOIN market.product_groups g ON g.metal_id = m.id AND g.category_id = c.id AND g.name_fa = n.group_fa
  ON CONFLICT (slug) DO NOTHING
  RETURNING id, slug
)
INSERT INTO market.price_series (slug, product_id, market_id, currency, unit, is_base, sort)
SELECT n.slug || '-' || n.market, p.id, mk.id, 'IRR', 'kg', n.is_base, n.sort
FROM n
JOIN p ON p.slug = n.slug
JOIN market.markets mk ON mk.slug = n.market
ON CONFLICT DO NOTHING;

-- +goose Down
-- Only rows that never got a price (price points keep a series, and a series its product).
DELETE FROM market.price_series s USING market.products p
WHERE s.product_id = p.id AND p.slug IN ('cast-iron-ingot-raw', 'cast-iron-ingot-blast-furnace', 'cast-iron-ime-esc-cib')
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id);
DELETE FROM market.products p
WHERE p.slug IN ('cast-iron-ingot-raw', 'cast-iron-ingot-blast-furnace', 'cast-iron-ime-esc-cib')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.product_id = p.id);
DELETE FROM market.product_groups g USING market.metals m
WHERE g.metal_id = m.id AND m.slug = 'cast-iron' AND g.name_fa = 'شمش چدن'
  AND NOT EXISTS (SELECT 1 FROM market.products p WHERE p.group_id = g.id);
