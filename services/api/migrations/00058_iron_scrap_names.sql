-- +goose Up
-- The client's iron list (2026-11-20), the part that changes existing rows (like the other metals' second migration).
-- Owner approval needed before the main site (it renames and hides rows that exist there):
--   * scrap named as in the client's file, in its order (the file's «آهن آلیای» and «آهنی سبک» read as the existing
--     «آهن آلیاژی» and «آهن سبک»); «پرسی بدنه», «مکانیکی و ته کارگاهی», «فله ورقی روغن» and «پرسی خودرو» are not in the
--     file and are hidden;
--   * hidden: the generic rows the producers' rows replace (گندله, آهن اسفنجی, میلگرد, ورق آهن, تیرآهن, لوله آهن, نبشی,
--     ناودانی, مفتول آهن). The world price («آهن») stays.
-- Hidden means inactive: rows and their price history stay, and staff can show them again in the admin.
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('iron-special', 'آهن ویژه', 500),
  ('iron-super-special', 'آهن سوپر ویژه', 501),
  ('iron-grade-1', 'آهن درجه 1', 502),
  ('iron-grade-2', 'آهن درجه 2', 503),
  ('iron-galvanized', 'گالوانیزه', 504),
  ('iron-alloy', 'آهن آلیاژی', 505),
  ('iron-light', 'آهن سبک', 506),
  ('iron-loose-turnings', 'سفاله پوشالی', 507),
  ('iron-tin-new', 'فله حلب نو', 508),
  ('iron-tin-old', 'فله حلب کهنه', 509),
  ('iron-doors', 'درب و پنجره آهنی', 510),
  ('iron-chip-turnings', 'سوفاله ناخنی', 511)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;

UPDATE market.products SET active = false, updated_at = now()
WHERE slug IN ('iron-pressed-body', 'iron-mechanical', 'iron-oily-sheet', 'iron-pressed-car', 'iron-pellet', 'iron-dri', 'iron-rebar',
               'iron-sheet', 'iron-beam', 'iron-pipe', 'iron-angle', 'iron-channel', 'iron-wire');
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('iron-pressed-body', 'iron-mechanical', 'iron-oily-sheet', 'iron-pressed-car', 'iron-pellet',
      'iron-dri', 'iron-rebar', 'iron-sheet', 'iron-beam', 'iron-pipe', 'iron-angle', 'iron-channel', 'iron-wire');

-- +goose Down
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('iron-pressed-body', 'iron-mechanical', 'iron-oily-sheet', 'iron-pressed-car', 'iron-pellet',
      'iron-dri', 'iron-rebar', 'iron-sheet', 'iron-beam', 'iron-pipe', 'iron-angle', 'iron-channel', 'iron-wire');
UPDATE market.products SET active = true, updated_at = now()
WHERE slug IN ('iron-pressed-body', 'iron-mechanical', 'iron-oily-sheet', 'iron-pressed-car', 'iron-pellet', 'iron-dri', 'iron-rebar',
               'iron-sheet', 'iron-beam', 'iron-pipe', 'iron-angle', 'iron-channel', 'iron-wire');
UPDATE market.products p SET name_fa = v.name_fa, sort = v.sort, updated_at = now()
FROM (VALUES
  ('iron-special', 'آهن ویژه', 500),
  ('iron-super-special', 'آهن سوپر ویژه', 501),
  ('iron-grade-1', 'آهن درجه ۱', 502),
  ('iron-grade-2', 'آهن درجه ۲', 503),
  ('iron-galvanized', 'گالوانیزه نو', 504),
  ('iron-alloy', 'آهن آلیاژی', 505),
  ('iron-light', 'آهن سبک', 511),
  ('iron-loose-turnings', 'سفاله پوشالی', 507),
  ('iron-tin-new', 'فله حلب نو', 512),
  ('iron-tin-old', 'فله حلب کهنه', 513),
  ('iron-doors', 'درب و پنجره آهنی', 514),
  ('iron-chip-turnings', 'سفاله ناخنی', 515)
) AS v (slug, name_fa, sort)
WHERE p.slug = v.slug;
