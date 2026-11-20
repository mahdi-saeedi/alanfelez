-- +goose Up
-- Raw materials are priced per ton (client + owner, 2026-11-20): every Toman series of a raw-materials product (ore,
-- concentrate, cement, pellets, sponge iron, and the IME raw rows) moves from Rial/kg to Rial/ton. Prices are stored per
-- the series' unit, so every amount already stored for these series is multiplied by 1000 (same price, new unit): the
-- points, the latest price and its previous close, and the price alerts' thresholds. World prices (USD/ton) and every
-- other product (Toman/kg) are unchanged. The site shows each series in its own unit (packages/ui displayAmount).
UPDATE market.price_points pp SET price_minor = pp.price_minor * 1000 WHERE pp.series_id IN (SELECT s.id FROM market.price_series s
  JOIN market.products p ON p.id = s.product_id
  JOIN market.product_categories c ON c.id = p.category_id
  WHERE c.slug = 'raw' AND s.currency = 'IRR' AND s.unit = 'kg');
UPDATE market.price_latest l SET price_minor = l.price_minor * 1000, prev_close_minor = l.prev_close_minor * 1000
WHERE l.series_id IN (SELECT s.id FROM market.price_series s
  JOIN market.products p ON p.id = s.product_id
  JOIN market.product_categories c ON c.id = p.category_id
  WHERE c.slug = 'raw' AND s.currency = 'IRR' AND s.unit = 'kg');
UPDATE app.price_alerts a SET threshold_minor = a.threshold_minor * 1000
WHERE a.threshold_minor IS NOT NULL AND a.series_id IN (SELECT s.id FROM market.price_series s
  JOIN market.products p ON p.id = s.product_id
  JOIN market.product_categories c ON c.id = p.category_id
  WHERE c.slug = 'raw' AND s.currency = 'IRR' AND s.unit = 'kg');
-- The unit last: the statements above find the series by their old unit.
UPDATE market.price_series s SET unit = 'ton', updated_at = now() WHERE s.id IN (SELECT s.id FROM market.price_series s
  JOIN market.products p ON p.id = s.product_id
  JOIN market.product_categories c ON c.id = p.category_id
  WHERE c.slug = 'raw' AND s.currency = 'IRR' AND s.unit = 'kg');

-- +goose Down
UPDATE market.price_points pp SET price_minor = (pp.price_minor + 500) / 1000 WHERE pp.series_id IN (SELECT s.id FROM market.price_series s
  JOIN market.products p ON p.id = s.product_id
  JOIN market.product_categories c ON c.id = p.category_id
  WHERE c.slug = 'raw' AND s.currency = 'IRR' AND s.unit = 'ton');
UPDATE market.price_latest l SET price_minor = (l.price_minor + 500) / 1000, prev_close_minor = (l.prev_close_minor + 500) / 1000
WHERE l.series_id IN (SELECT s.id FROM market.price_series s
  JOIN market.products p ON p.id = s.product_id
  JOIN market.product_categories c ON c.id = p.category_id
  WHERE c.slug = 'raw' AND s.currency = 'IRR' AND s.unit = 'ton');
UPDATE app.price_alerts a SET threshold_minor = (a.threshold_minor + 500) / 1000
WHERE a.threshold_minor IS NOT NULL AND a.series_id IN (SELECT s.id FROM market.price_series s
  JOIN market.products p ON p.id = s.product_id
  JOIN market.product_categories c ON c.id = p.category_id
  WHERE c.slug = 'raw' AND s.currency = 'IRR' AND s.unit = 'ton');
-- The unit last: the statements above find the series by their old unit.
UPDATE market.price_series s SET unit = 'kg', updated_at = now() WHERE s.id IN (SELECT s.id FROM market.price_series s
  JOIN market.products p ON p.id = s.product_id
  JOIN market.product_categories c ON c.id = p.category_id
  WHERE c.slug = 'raw' AND s.currency = 'IRR' AND s.unit = 'ton');
