-- +goose Up
-- The client's lead list (2026-11-19, an Excel file), shaped like aluminium, copper and zinc: raw materials in three
-- groups (کلوخه سرب اکسیدی و سولفیدی 3–10 %, کنسانتره سرب اکسیدی 45–70 %), «شمش سرب کارگاهی» and «ورق سربی» 1 and 2 mm in
-- «بازار», two scrap rows the file adds («ضایعات باتری سربی», «ضایعات لوله و ورق سربی»), all in Toman/kg; and on the IME
-- «گواهی سپرده شمش سرب» (the exchange's lead ingot deposit certificate, traded daily since 1405-04-08; 1 certificate =
-- 1 kg of 99.99 % lead): lead ingot itself has no IME trades (client, 2026-11-19). Additive only (ON CONFLICT DO
-- NOTHING); a row appears on the site once it has a price. Nothing happens on a fresh database.
INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, g.name_fa, g.name_en, g.sort
FROM market.metals m,
     (VALUES
       ('raw', 'کلوخه سرب اکسیدی', 'Oxide lead ore', 1),
       ('raw', 'کلوخه سرب سولفیدی', 'Sulphide lead ore', 2),
       ('raw', 'کنسانتره سرب اکسیدی', 'Oxide lead concentrate', 3),
       ('intermediate', 'شمش سرب', 'Lead ingot', 10),
       ('intermediate', 'ورق سربی', 'Lead sheet', 11)) AS g (category, name_fa, name_en, sort)
JOIN market.product_categories c ON c.slug = g.category
WHERE m.slug = 'lead'
ON CONFLICT (metal_id, category_id, name_fa) DO NOTHING;

-- One statement (no temporary table, which sqlc would read as a model): the products, then their price rows.
WITH n (slug, name_fa, category, group_fa, market, is_base, sort) AS (VALUES
  ('lead-oxide-ore-3', 'کلوخه سرب اکسیدی ۳ درصد', 'raw', 'کلوخه سرب اکسیدی', 'free', false, 320),
  ('lead-oxide-ore-4', 'کلوخه سرب اکسیدی ۴ درصد', 'raw', 'کلوخه سرب اکسیدی', 'free', false, 321),
  ('lead-oxide-ore-5', 'کلوخه سرب اکسیدی ۵ درصد', 'raw', 'کلوخه سرب اکسیدی', 'free', false, 322),
  ('lead-oxide-ore-6', 'کلوخه سرب اکسیدی ۶ درصد', 'raw', 'کلوخه سرب اکسیدی', 'free', false, 323),
  ('lead-oxide-ore-7', 'کلوخه سرب اکسیدی ۷ درصد', 'raw', 'کلوخه سرب اکسیدی', 'free', false, 324),
  ('lead-oxide-ore-8', 'کلوخه سرب اکسیدی ۸ درصد', 'raw', 'کلوخه سرب اکسیدی', 'free', false, 325),
  ('lead-oxide-ore-9', 'کلوخه سرب اکسیدی ۹ درصد', 'raw', 'کلوخه سرب اکسیدی', 'free', false, 326),
  ('lead-oxide-ore-10', 'کلوخه سرب اکسیدی ۱۰ درصد', 'raw', 'کلوخه سرب اکسیدی', 'free', false, 327),
  ('lead-sulfide-ore-3', 'کلوخه سرب سولفیدی ۳ درصد', 'raw', 'کلوخه سرب سولفیدی', 'free', false, 328),
  ('lead-sulfide-ore-4', 'کلوخه سرب سولفیدی ۴ درصد', 'raw', 'کلوخه سرب سولفیدی', 'free', false, 329),
  ('lead-sulfide-ore-5', 'کلوخه سرب سولفیدی ۵ درصد', 'raw', 'کلوخه سرب سولفیدی', 'free', false, 330),
  ('lead-sulfide-ore-6', 'کلوخه سرب سولفیدی ۶ درصد', 'raw', 'کلوخه سرب سولفیدی', 'free', false, 331),
  ('lead-sulfide-ore-7', 'کلوخه سرب سولفیدی ۷ درصد', 'raw', 'کلوخه سرب سولفیدی', 'free', false, 332),
  ('lead-sulfide-ore-8', 'کلوخه سرب سولفیدی ۸ درصد', 'raw', 'کلوخه سرب سولفیدی', 'free', false, 333),
  ('lead-sulfide-ore-9', 'کلوخه سرب سولفیدی ۹ درصد', 'raw', 'کلوخه سرب سولفیدی', 'free', false, 334),
  ('lead-sulfide-ore-10', 'کلوخه سرب سولفیدی ۱۰ درصد', 'raw', 'کلوخه سرب سولفیدی', 'free', false, 335),
  ('lead-oxide-conc-45', 'کنسانتره سرب اکسیدی ۴۵ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 336),
  ('lead-oxide-conc-46', 'کنسانتره سرب اکسیدی ۴۶ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 337),
  ('lead-oxide-conc-47', 'کنسانتره سرب اکسیدی ۴۷ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 338),
  ('lead-oxide-conc-48', 'کنسانتره سرب اکسیدی ۴۸ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 339),
  ('lead-oxide-conc-49', 'کنسانتره سرب اکسیدی ۴۹ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 340),
  ('lead-oxide-conc-50', 'کنسانتره سرب اکسیدی ۵۰ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 341),
  ('lead-oxide-conc-51', 'کنسانتره سرب اکسیدی ۵۱ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 342),
  ('lead-oxide-conc-52', 'کنسانتره سرب اکسیدی ۵۲ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 343),
  ('lead-oxide-conc-53', 'کنسانتره سرب اکسیدی ۵۳ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 344),
  ('lead-oxide-conc-54', 'کنسانتره سرب اکسیدی ۵۴ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 345),
  ('lead-oxide-conc-55', 'کنسانتره سرب اکسیدی ۵۵ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 346),
  ('lead-oxide-conc-56', 'کنسانتره سرب اکسیدی ۵۶ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 347),
  ('lead-oxide-conc-57', 'کنسانتره سرب اکسیدی ۵۷ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 348),
  ('lead-oxide-conc-58', 'کنسانتره سرب اکسیدی ۵۸ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 349),
  ('lead-oxide-conc-59', 'کنسانتره سرب اکسیدی ۵۹ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 350),
  ('lead-oxide-conc-60', 'کنسانتره سرب اکسیدی ۶۰ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 351),
  ('lead-oxide-conc-61', 'کنسانتره سرب اکسیدی ۶۱ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 352),
  ('lead-oxide-conc-62', 'کنسانتره سرب اکسیدی ۶۲ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 353),
  ('lead-oxide-conc-63', 'کنسانتره سرب اکسیدی ۶۳ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 354),
  ('lead-oxide-conc-64', 'کنسانتره سرب اکسیدی ۶۴ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 355),
  ('lead-oxide-conc-65', 'کنسانتره سرب اکسیدی ۶۵ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 356),
  ('lead-oxide-conc-66', 'کنسانتره سرب اکسیدی ۶۶ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 357),
  ('lead-oxide-conc-67', 'کنسانتره سرب اکسیدی ۶۷ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 358),
  ('lead-oxide-conc-68', 'کنسانتره سرب اکسیدی ۶۸ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 359),
  ('lead-oxide-conc-69', 'کنسانتره سرب اکسیدی ۶۹ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 360),
  ('lead-oxide-conc-70', 'کنسانتره سرب اکسیدی ۷۰ درصد', 'raw', 'کنسانتره سرب اکسیدی', 'free', false, 361),
  ('lead-ingot-workshop', 'شمش سرب کارگاهی', 'intermediate', 'شمش سرب', 'free', false, 410),
  ('lead-sheet-2mm', 'ورق سربی 2 میلیمتر', 'intermediate', 'ورق سربی', 'free', false, 411),
  ('lead-sheet-1mm', 'ورق سربی 1 میلیمتر', 'intermediate', 'ورق سربی', 'free', false, 412),
  ('lead-ime-deposit-ingot', 'گواهی سپرده شمش سرب', 'intermediate', NULL, 'ime', true, 380),
  ('lead-battery-scrap', 'ضایعات باتری سربی', 'scrap', NULL, 'free', false, 502),
  ('lead-pipe-sheet-scrap', 'ضایعات لوله و ورق سربی', 'scrap', NULL, 'free', false, 503)),
p AS (
  INSERT INTO market.products (slug, metal_id, category_id, name_fa, sort, group_id)
  SELECT n.slug, m.id, c.id, n.name_fa, n.sort, g.id
  FROM n
  JOIN market.metals m ON m.slug = 'lead'
  JOIN market.product_categories c ON c.slug = n.category
  LEFT JOIN market.product_groups g ON g.metal_id = m.id AND g.category_id = c.id AND g.name_fa = n.group_fa
  ON CONFLICT (slug) DO NOTHING
  RETURNING id, slug
)
INSERT INTO market.price_series (slug, product_id, market_id, currency, unit, is_base, sort)
SELECT n.slug || '-' || n.market, p.id, mk.id, 'IRR', 'kg', n.is_base, n.sort
FROM n
JOIN p ON p.slug = n.slug
JOIN market.markets mk ON mk.slug = n.market
ON CONFLICT DO NOTHING;

-- +goose Down
-- Only rows that never got a price (price points keep a series, and a series its product).
DELETE FROM market.price_series s USING market.products p
WHERE s.product_id = p.id AND p.slug IN ('lead-oxide-ore-3', 'lead-oxide-ore-4', 'lead-oxide-ore-5', 'lead-oxide-ore-6', 'lead-oxide-ore-7', 'lead-oxide-ore-8', 'lead-oxide-ore-9', 'lead-oxide-ore-10', 'lead-sulfide-ore-3', 'lead-sulfide-ore-4', 'lead-sulfide-ore-5', 'lead-sulfide-ore-6', 'lead-sulfide-ore-7', 'lead-sulfide-ore-8', 'lead-sulfide-ore-9', 'lead-sulfide-ore-10', 'lead-oxide-conc-45', 'lead-oxide-conc-46', 'lead-oxide-conc-47', 'lead-oxide-conc-48', 'lead-oxide-conc-49', 'lead-oxide-conc-50', 'lead-oxide-conc-51', 'lead-oxide-conc-52', 'lead-oxide-conc-53', 'lead-oxide-conc-54', 'lead-oxide-conc-55', 'lead-oxide-conc-56', 'lead-oxide-conc-57', 'lead-oxide-conc-58', 'lead-oxide-conc-59', 'lead-oxide-conc-60', 'lead-oxide-conc-61', 'lead-oxide-conc-62', 'lead-oxide-conc-63', 'lead-oxide-conc-64', 'lead-oxide-conc-65', 'lead-oxide-conc-66', 'lead-oxide-conc-67', 'lead-oxide-conc-68', 'lead-oxide-conc-69', 'lead-oxide-conc-70', 'lead-ingot-workshop', 'lead-sheet-2mm', 'lead-sheet-1mm', 'lead-ime-deposit-ingot', 'lead-battery-scrap', 'lead-pipe-sheet-scrap')
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id);
DELETE FROM market.products p
WHERE p.slug IN ('lead-oxide-ore-3', 'lead-oxide-ore-4', 'lead-oxide-ore-5', 'lead-oxide-ore-6', 'lead-oxide-ore-7', 'lead-oxide-ore-8', 'lead-oxide-ore-9', 'lead-oxide-ore-10', 'lead-sulfide-ore-3', 'lead-sulfide-ore-4', 'lead-sulfide-ore-5', 'lead-sulfide-ore-6', 'lead-sulfide-ore-7', 'lead-sulfide-ore-8', 'lead-sulfide-ore-9', 'lead-sulfide-ore-10', 'lead-oxide-conc-45', 'lead-oxide-conc-46', 'lead-oxide-conc-47', 'lead-oxide-conc-48', 'lead-oxide-conc-49', 'lead-oxide-conc-50', 'lead-oxide-conc-51', 'lead-oxide-conc-52', 'lead-oxide-conc-53', 'lead-oxide-conc-54', 'lead-oxide-conc-55', 'lead-oxide-conc-56', 'lead-oxide-conc-57', 'lead-oxide-conc-58', 'lead-oxide-conc-59', 'lead-oxide-conc-60', 'lead-oxide-conc-61', 'lead-oxide-conc-62', 'lead-oxide-conc-63', 'lead-oxide-conc-64', 'lead-oxide-conc-65', 'lead-oxide-conc-66', 'lead-oxide-conc-67', 'lead-oxide-conc-68', 'lead-oxide-conc-69', 'lead-oxide-conc-70', 'lead-ingot-workshop', 'lead-sheet-2mm', 'lead-sheet-1mm', 'lead-ime-deposit-ingot', 'lead-battery-scrap', 'lead-pipe-sheet-scrap')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.product_id = p.id);
DELETE FROM market.product_groups g USING market.metals m
WHERE g.metal_id = m.id AND m.slug = 'lead' AND g.name_fa IN ('کلوخه سرب اکسیدی', 'کلوخه سرب سولفیدی', 'کنسانتره سرب اکسیدی', 'شمش سرب', 'ورق سربی')
  AND NOT EXISTS (SELECT 1 FROM market.products p WHERE p.group_id = g.id);
