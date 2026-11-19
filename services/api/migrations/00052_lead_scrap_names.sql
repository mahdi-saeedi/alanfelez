-- +goose Up
-- The client's lead list (2026-11-19), the part that changes existing rows (like 00041/00043/00049). Owner approval
-- needed before the main site (it renames and hides rows that exist there):
--   * scrap named as in the client's file, in its order: «ضایعات سرب خشک», «ضایعات سرب نرم» (then the two new rows of
--     00051); the older «باتری خشک» and «باتری موتور» are hidden (the file has «ضایعات باتری سربی» instead);
--   * hidden: the generic «ورق سرب» (the 1 and 2 mm sheets replace it) and the generic IME «شمش سرب» row (lead ingot has
--     no IME trades; the deposit certificate replaces it; the product keeps its world price).
-- Hidden means inactive: rows and their price history stay, and staff can show them again in the admin.
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('lead-hard', 'ضایعات سرب خشک', 500),
  ('lead-soft', 'ضایعات سرب نرم', 501)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;

UPDATE market.products SET active = false, updated_at = now() WHERE slug IN ('lead-battery-dry', 'lead-battery-motor', 'lead-sheet');
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('lead-battery-dry', 'lead-battery-motor', 'lead-sheet');
UPDATE market.price_series SET active = false, updated_at = now() WHERE slug = 'lead-ingot-ime';

-- +goose Down
UPDATE market.price_series SET active = true, updated_at = now() WHERE slug = 'lead-ingot-ime';
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('lead-battery-dry', 'lead-battery-motor', 'lead-sheet');
UPDATE market.products SET active = true, updated_at = now() WHERE slug IN ('lead-battery-dry', 'lead-battery-motor', 'lead-sheet');
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('lead-hard', 'سرب خشک', 501),
  ('lead-soft', 'سرب نرم', 500)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;
