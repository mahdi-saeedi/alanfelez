-- +goose Up
-- The client (2026-11-18): hide the market's generic «مفتول مسی» too; copper wire rod is priced on the IME rows
-- («مس مفتول» and «سیم و مفتول مسی» per producer, 00042). Owner approval needed before the main site (it hides a row
-- that exists there). Hidden means inactive: the row and its price history stay, and staff can show it again.
UPDATE market.products SET active = false, updated_at = now() WHERE slug = 'copper-wire';
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug = 'copper-wire';

-- +goose Down
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug = 'copper-wire';
UPDATE market.products SET active = true, updated_at = now() WHERE slug = 'copper-wire';
