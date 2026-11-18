-- +goose Up
-- The client's copper list (2026-11-18), the part that changes existing rows (like 00041 for aluminium). Owner approval
-- needed before the main site (it renames and hides a row that exists there):
--   * scrap in the client's file order, «لوله مسی» (scrap) named «لوله مس» as in the file;
--   * the older generic «لوله مسی» (intermediate) is hidden: the new list has its sizes instead (migration 00042).
-- Hidden means inactive: the row and its price history stay, and staff can show it again in the admin.
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('copper-red', 'مس کابلی قرمز', 500),
  ('copper-cable-black', 'مس کابلی سیاه', 501),
  ('copper-telecom', 'مس مخابراتی', 502),
  ('copper-armature', 'مس آرمیچری', 503),
  ('copper-pipe-scrap', 'لوله مس', 504),
  ('copper-melted', 'مس ذوبی', 505),
  ('copper-mill', 'مس آسیابی', 506)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;

UPDATE market.products SET active = false, updated_at = now() WHERE slug = 'copper-pipe';
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug = 'copper-pipe';

-- +goose Down
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug = 'copper-pipe';
UPDATE market.products SET active = true, updated_at = now() WHERE slug = 'copper-pipe';
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('copper-red', 'مس کابلی قرمز', 20),
  ('copper-cable-black', 'مس کابلی سیاه', 501),
  ('copper-telecom', 'مس مخابراتی', 500),
  ('copper-armature', 'مس آرمیچری', 503),
  ('copper-pipe-scrap', 'لوله مسی', 504),
  ('copper-melted', 'مس ذوبی', 502),
  ('copper-mill', 'مس آسیابی', 505)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;
