-- +goose Up
-- Three price sources instead of five (client, 2026-10-28): «بورس کالای ایران», «قیمت جهانی», «بازار». LME prices are
-- world prices like the other global ones (some metals' world price is read off their global chart anyway), and the
-- Iran Iron Market's series join the free market. Tiers don't change: global stays free, iron/free stay Silver.
-- A series moves only when the target market has no series for the same product, currency and unit (that pair
-- would break the unique key); a market is deleted only once nothing points at it.
UPDATE market.price_series s SET market_id = g.id
FROM market.markets l, market.markets g
WHERE l.slug = 'lme' AND g.slug = 'global' AND s.market_id = l.id
  AND NOT EXISTS (SELECT 1 FROM market.price_series t
                  WHERE t.market_id = g.id AND t.product_id = s.product_id AND t.currency = s.currency AND t.unit = s.unit);

UPDATE market.price_series s SET market_id = f.id
FROM market.markets i, market.markets f
WHERE i.slug = 'iron' AND f.slug = 'free' AND s.market_id = i.id
  AND NOT EXISTS (SELECT 1 FROM market.price_series t
                  WHERE t.market_id = f.id AND t.product_id = s.product_id AND t.currency = s.currency AND t.unit = s.unit);

UPDATE market.markets SET sort = 1 WHERE slug = 'ime';
UPDATE market.markets SET name_fa = 'بازار', name_en = 'Market', sort = 2 WHERE slug = 'free';
UPDATE market.markets SET name_fa = 'قیمت جهانی', name_en = 'World price', sort = 3 WHERE slug = 'global';

DELETE FROM market.markets m WHERE m.slug IN ('lme', 'iron')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.market_id = m.id);

-- +goose Down
INSERT INTO market.markets (slug, name_fa, name_en, scope, sort) VALUES
  ('iron', 'تالار آهن ایران', 'Iran Iron Market', 'domestic', 2),
  ('lme', 'بورس فلزات لندن (LME)', 'London Metal Exchange', 'global', 4)
ON CONFLICT (slug) DO NOTHING;
UPDATE market.markets SET name_fa = 'بازار آزاد', name_en = 'Free market', sort = 3 WHERE slug = 'free';
UPDATE market.markets SET name_fa = 'بازار جهانی', name_en = 'Global market', sort = 5 WHERE slug = 'global';
-- The series keep their old slugs (copper-lme, rebar-16-iron), which say where they came from.
UPDATE market.price_series s SET market_id = (SELECT id FROM market.markets WHERE slug = 'lme') WHERE s.slug LIKE '%-lme';
UPDATE market.price_series s SET market_id = (SELECT id FROM market.markets WHERE slug = 'iron') WHERE s.slug LIKE '%-iron';
