-- +goose Up
-- The client's zinc list (2026-11-19), the part that changes existing rows (like 00041/00043). Owner approval needed
-- before the main site (it renames and hides rows that exist there):
--   * scrap named as in the client's file, in its order;
--   * hidden: the generic «سنگ معدن روی» (the file has the oxide and sulphide grades instead) and the generic IME
--     «شمش روی» row (the IME ingots per producer and their average replace it; the product keeps its world price).
-- Hidden means inactive: rows and their price history stay, and staff can show them again in the admin.
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('zinc-melted', 'ضایعات روی ذوبی', 500),
  ('zinc-sheet-scrap', 'ضایعات ورق های روی', 501),
  ('zinc-pipe-scrap', 'ضایعات لوله های روی', 502),
  ('zinc-frame', 'ضایعات قاب های رویی', 503),
  ('zinc-auto-parts', 'قطعات رویی خودرو', 504)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;

UPDATE market.products SET active = false, updated_at = now() WHERE slug = 'zinc-ore';
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug = 'zinc-ore';
UPDATE market.price_series SET active = false, updated_at = now() WHERE slug = 'zinc-ingot-ime';

-- +goose Down
UPDATE market.price_series SET active = true, updated_at = now() WHERE slug = 'zinc-ingot-ime';
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug = 'zinc-ore';
UPDATE market.products SET active = true, updated_at = now() WHERE slug = 'zinc-ore';
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('zinc-melted', 'روی ذوبی', 500),
  ('zinc-sheet-scrap', 'ورق‌های روی', 501),
  ('zinc-pipe-scrap', 'لوله‌های روی', 502),
  ('zinc-frame', 'قاب‌های رویی', 503),
  ('zinc-auto-parts', 'قطعات خودرو رویی', 504)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;
