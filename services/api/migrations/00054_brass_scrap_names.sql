-- +goose Up
-- The client's brass list (2026-11-19), the part that changes existing rows (like 00041/00043/00049/00052). Owner
-- approval needed before the main site (it renames and hides rows that exist there):
--   * scrap named as in the client's file, in its order (then «ته میل برنجی», 00053); «لوستر برنجی» is not in the file
--     and is hidden;
--   * hidden: the generic «لوله برنجی», «ورق برنجی», «میلگرد برنجی», «تسمه برنجی» (their sizes replace them, 00053).
-- Hidden means inactive: rows and their price history stay, and staff can show them again in the admin.
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('brass-clippings', 'دم قیچی برنجی', 500),
  ('brass-yellow-scrap', 'برنج زرد بار', 501),
  ('brass-white', 'برنج سفید بار (لپ بار)', 502),
  ('brass-turnings', 'سوفاله برنج', 503),
  ('brass-radiator', 'رادیات برنجی', 504),
  ('brass-mixed', 'برنج درهم', 505),
  ('brass-fittings', 'شیر آلات برنجی', 506)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;

UPDATE market.products SET active = false, updated_at = now()
WHERE slug IN ('brass-chandelier', 'brass-pipe', 'brass-sheet', 'brass-rod', 'brass-strip');
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('brass-chandelier', 'brass-pipe', 'brass-sheet', 'brass-rod', 'brass-strip');

-- +goose Down
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('brass-chandelier', 'brass-pipe', 'brass-sheet', 'brass-rod', 'brass-strip');
UPDATE market.products SET active = true, updated_at = now()
WHERE slug IN ('brass-chandelier', 'brass-pipe', 'brass-sheet', 'brass-rod', 'brass-strip');
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('brass-clippings', 'برنج دم قیچی', 500),
  ('brass-yellow-scrap', 'برنج زردبار', 501),
  ('brass-white', 'برنج سفید بار', 502),
  ('brass-turnings', 'سفاله برنج', 503),
  ('brass-radiator', 'رادیات برنجی', 504),
  ('brass-mixed', 'برنج درهم', 505),
  ('brass-fittings', 'شیرآلات برنجی', 507)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;
