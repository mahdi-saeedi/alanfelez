-- +goose Up
-- The client's plan table (2026-10-26, OK'd by the owner):
-- 1. Free sees global prices and IME (بورس کالا) prices only; the domestic day prices of the free market and the
--    Iran iron market («قیمت روز کالا») are Silver and Gold.
UPDATE market.price_series s SET is_base = false
FROM market.markets m
WHERE s.market_id = m.id AND m.scope = 'domestic' AND m.slug <> 'ime' AND s.is_base;

-- 2. Discounts: 3 months −5 % (was −10 %), 1 year −15 % (was −20 %). Prices are versioned: the old rows are closed
--    (orders keep pointing at them) and new ones start now.
--    On a fresh database the plans aren't seeded yet (the seed runs after migrations and has the new amounts), so
--    only rows that exist are replaced.
WITH closed AS (
  UPDATE app.plan_prices SET valid_to = now(), updated_at = now()
  WHERE valid_to IS NULL AND period IN ('quarter', 'year') AND plan_code IN ('silver', 'gold')
  RETURNING plan_code, period
)
INSERT INTO app.plan_prices (plan_code, period, amount_rial)
SELECT c.plan_code, c.period, n.amount_rial
FROM closed c
JOIN (VALUES
  ('silver', 'quarter',  28500000),   --  2,850,000 Toman = 3 × 1,000,000 × 0.95
  ('silver', 'year',    102000000),   -- 10,200,000 Toman = 12 × 1,000,000 × 0.85
  ('gold',   'quarter',  57000000),   --  5,700,000 Toman
  ('gold',   'year',    204000000)    -- 20,400,000 Toman
) AS n (plan_code, period, amount_rial) ON n.plan_code = c.plan_code AND n.period = c.period;

-- +goose Down
DELETE FROM app.plan_prices pp
WHERE pp.valid_to IS NULL AND pp.period IN ('quarter', 'year') AND pp.plan_code IN ('silver', 'gold')
  AND NOT EXISTS (SELECT 1 FROM app.orders o WHERE o.plan_price_id = pp.id);
UPDATE app.plan_prices pp SET valid_to = NULL
WHERE pp.id IN (SELECT DISTINCT ON (plan_code, period) id FROM app.plan_prices
                WHERE period IN ('quarter', 'year') AND plan_code IN ('silver', 'gold') AND valid_to IS NOT NULL
                ORDER BY plan_code, period, valid_to DESC)
  AND NOT EXISTS (SELECT 1 FROM app.plan_prices c WHERE c.plan_code = pp.plan_code AND c.period = pp.period AND c.valid_to IS NULL);
UPDATE market.price_series s SET is_base = true
FROM market.markets m
WHERE s.market_id = m.id AND s.slug IN ('copper-red-free', 'brass-yellow-free', 'rebar-16-iron', 'cast-iron-scrap-free');
