-- +goose Up
-- The client's cast iron list (2026-11-20), the part that changes existing rows (like 00041/00043/00049/00052/00054).
-- Owner approval needed before the main site (it renames and hides rows that exist there):
--   * «چدن خاکستری» and «چدن داکتیل» become «شمش چدن خاکستری» and «شمش چدن داکتیل» in the group «شمش چدن» (00055),
--     keeping their prices; scrap named as in the client's file, in its order;
--   * hidden: the generic «شمش چدن» (the four ingots replace it) and «ورق چدن» (not in the file).
-- Hidden means inactive: rows and their price history stay, and staff can show them again in the admin.
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('cast-iron-gray', 'شمش چدن خاکستری', 410),
  ('cast-iron-ductile', 'شمش چدن داکتیل', 411),
  ('cast-iron-small', 'ضایعات چدن ریز بار', 500),
  ('cast-iron-large', 'ضایعات چدن درشت بار', 501),
  ('cast-iron-ductile-small', 'ضایعات داکتیل چدن ریز بار', 502),
  ('cast-iron-ductile-large', 'ضایعات داکتیل چدن درشت بار', 503),
  ('cast-iron-turnings', 'سوفاله چدن', 504),
  ('cast-iron-ni-hard', 'ضایعات نایهارد', 505)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;

UPDATE market.products p SET group_id = g.id, updated_at = now()
FROM market.product_groups g JOIN market.metals m ON m.id = g.metal_id
WHERE m.slug = 'cast-iron' AND g.name_fa = 'شمش چدن' AND p.slug IN ('cast-iron-gray', 'cast-iron-ductile');

UPDATE market.products SET active = false, updated_at = now() WHERE slug IN ('cast-iron-ingot', 'cast-iron-sheet');
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('cast-iron-ingot', 'cast-iron-sheet');

-- +goose Down
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('cast-iron-ingot', 'cast-iron-sheet');
UPDATE market.products SET active = true, updated_at = now() WHERE slug IN ('cast-iron-ingot', 'cast-iron-sheet');
UPDATE market.products SET group_id = NULL, updated_at = now() WHERE slug IN ('cast-iron-gray', 'cast-iron-ductile');
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('cast-iron-gray', 'چدن خاکستری', 402),
  ('cast-iron-ductile', 'چدن داکتیل', 403),
  ('cast-iron-small', 'چدن ریز بار', 500),
  ('cast-iron-large', 'چدن درشت بار', 501),
  ('cast-iron-ductile-small', 'داکتیل ریزبار', 502),
  ('cast-iron-ductile-large', 'داکتیل درشت بار', 503),
  ('cast-iron-turnings', 'سفاله چدن', 504),
  ('cast-iron-ni-hard', 'نایهارد', 505)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;
