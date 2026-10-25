-- +goose Up
-- Global (LME) prices are free for everyone (client's written OK, 2026-10-25; owner asked for it): every series of
-- the LME market becomes a base series, which the free tier sees (prices list, home cards, 1-month chart).
-- New LME series added in the admin are base too (InsertSeries).
UPDATE market.price_series s SET is_base = true
FROM market.markets m
WHERE s.market_id = m.id AND m.slug = 'lme' AND NOT s.is_base;

-- +goose Down
UPDATE market.price_series s SET is_base = false
FROM market.markets m
WHERE s.market_id = m.id AND m.slug = 'lme' AND s.is_base;
