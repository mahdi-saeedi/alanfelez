-- +goose Up
-- The client's aluminium list (2026-11-17), the part that changes existing rows. Owner approval needed before the main
-- site (it renames and hides rows that exist there):
--   * scrap names exactly as in the client's file, in its order; «پیستون» and «سرسیلندر» become one row
--     «ضایعات پیستون و سرسیلندر» (the piston row keeps its prices; the cylinder head row is hidden);
--   * the older generic rows «بیلت آلومینیوم», «اسلب آلومینیوم», «میلگرد آلومینیوم» are hidden: the new list has the
--     sizes instead (migration 00040).
-- Hidden means inactive: the rows and their price history stay, and staff can show them again in the admin.
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('aluminum-soft-scrap', 'ضایعات آلومینیوم نرم', 500),
  ('aluminum-profile', 'ضایعات پروفیل و شاخه', 501),
  ('aluminum-utensil', 'ضایعات آلومینیوم ظرفی', 502),
  ('aluminum-dry', 'ضایعات آلومینیوم خشک', 503),
  ('aluminum-can', 'ضایعات قوطی رانی', 504),
  ('aluminum-ring', 'ضایعات رینگ آلومینیومی', 505),
  ('aluminum-piston', 'ضایعات پیستون و سرسیلندر', 506),
  ('aluminum-radiator', 'ضایعات رادیات آلومینیومی', 507),
  ('aluminum-soft-turnings', 'سوفاله آلومینیوم نرم', 508),
  ('aluminum-dry-turnings', 'سوفاله آلومینیوم خشک', 509)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;

UPDATE market.products SET active = false, updated_at = now()
WHERE slug IN ('aluminum-cylinder-head', 'aluminum-billet', 'aluminum-slab', 'aluminum-rod');
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('aluminum-cylinder-head', 'aluminum-billet', 'aluminum-slab', 'aluminum-rod');

-- +goose Down
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('aluminum-cylinder-head', 'aluminum-billet', 'aluminum-slab', 'aluminum-rod');
UPDATE market.products SET active = true, updated_at = now()
WHERE slug IN ('aluminum-cylinder-head', 'aluminum-billet', 'aluminum-slab', 'aluminum-rod');
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('aluminum-soft-scrap', 'آلومینیوم نرم', 11),
  ('aluminum-profile', 'پروفیل شاخه', 508),
  ('aluminum-utensil', 'آلومینیوم ظرفی', 506),
  ('aluminum-dry', 'آلومینیوم خشک', 503),
  ('aluminum-can', 'قوطی رانی', 504),
  ('aluminum-ring', 'رینگ آلومینیومی', 500),
  ('aluminum-piston', 'پیستون', 501),
  ('aluminum-radiator', 'رادیات آلومینیوم', 507),
  ('aluminum-soft-turnings', 'سفاله آلومینیوم نرم', 509),
  ('aluminum-dry-turnings', 'سفاله آلومینیوم خشک', 505)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;
