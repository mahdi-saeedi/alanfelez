-- +goose Up
-- The client + owner (2026-11-18): two older price rows the client's lists replace are hidden (inactive; history kept):
--   * «مس کاتد» in «بازار» (the client's copper list has the cathode on the IME only);
--   * the generic IME «شمش آلومینیوم» (the IME ingots per producer and their average replace it).
-- Only these series: their products keep the world price (LME) rows.
UPDATE market.price_series SET active = false, updated_at = now() WHERE slug IN ('copper-cathode-free', 'aluminum-ingot-ime');

-- +goose Down
UPDATE market.price_series SET active = true, updated_at = now() WHERE slug IN ('copper-cathode-free', 'aluminum-ingot-ime');
