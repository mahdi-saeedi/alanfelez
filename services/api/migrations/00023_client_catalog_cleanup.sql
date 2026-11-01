-- The client's product list (2026-11-01) replaces the 12 sample products of the first seed (config/seed/reference/
-- 40-prices.yaml). Owner approval needed (it deletes price history): see docs/TODO.md.
--   * renamed: «ضایعات آلومینیوم نرم» → «آلومینیوم نرم», «مس قرمز» → «مس کابلی قرمز»;
--   * «شمش آلومینیوم» moves to the intermediate products;
--   * products the list doesn't have are deleted with their day-price rows and history: «مس کابلی», «ضایعات برنج»,
--     «ورق ۴ آهن», and the domestic rows of «برنج زرد», «میلگرد ۱۶», «ضایعات چدن». Those three carry the world price of
--     brass, iron and cast iron («قیمت جهانی»), which stays: the product is renamed after its metal.
--   Users' price alerts on deleted rows are deleted; saved calculations keep their numbers and lose the link.

-- +goose Up
UPDATE market.products SET name_fa = 'آلومینیوم نرم', name_en = 'Soft aluminum' WHERE slug = 'aluminum-soft-scrap';
UPDATE market.products SET name_fa = 'مس کابلی قرمز', name_en = 'Red cable copper' WHERE slug = 'copper-red';
UPDATE market.products p SET category_id = c.id
FROM market.product_categories c
WHERE c.slug = 'intermediate' AND p.slug = 'aluminum-ingot';

UPDATE market.products SET name_fa = 'برنج', name_en = 'Brass' WHERE slug = 'brass-yellow';
UPDATE market.products SET name_fa = 'آهن', name_en = 'Iron' WHERE slug = 'rebar-16';
UPDATE market.products SET name_fa = 'چدن', name_en = 'Cast iron' WHERE slug = 'cast-iron-scrap';

CREATE TEMP TABLE gone_series ON COMMIT DROP AS
SELECT s.id FROM market.price_series s JOIN market.products p ON p.id = s.product_id
WHERE p.slug IN ('copper-cable', 'brass-scrap', 'steel-sheet-4')
   OR s.slug IN ('brass-yellow-free', 'rebar-16-iron', 'cast-iron-scrap-free');

DELETE FROM app.price_alerts WHERE series_id IN (SELECT id FROM gone_series);
UPDATE app.calculations SET series_id = NULL WHERE series_id IN (SELECT id FROM gone_series);
DELETE FROM market.price_latest WHERE series_id IN (SELECT id FROM gone_series);
DELETE FROM market.price_points WHERE series_id IN (SELECT id FROM gone_series);
DELETE FROM market.price_series WHERE id IN (SELECT id FROM gone_series);
DELETE FROM market.products p
WHERE p.slug IN ('copper-cable', 'brass-scrap', 'steel-sheet-4')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.product_id = p.id);

-- +goose Down
-- Deleted history can't come back (restore a backup if needed); only the names and categories are put back.
UPDATE market.products SET name_fa = 'ضایعات آلومینیوم نرم', name_en = 'Soft aluminum scrap' WHERE slug = 'aluminum-soft-scrap';
UPDATE market.products SET name_fa = 'مس قرمز', name_en = 'Red copper' WHERE slug = 'copper-red';
UPDATE market.products SET name_fa = 'برنج زرد', name_en = 'Yellow brass' WHERE slug = 'brass-yellow';
UPDATE market.products SET name_fa = 'میلگرد ۱۶', name_en = 'Rebar 16 mm' WHERE slug = 'rebar-16';
UPDATE market.products SET name_fa = 'ضایعات چدن', name_en = 'Cast iron scrap' WHERE slug = 'cast-iron-scrap';
UPDATE market.products p SET category_id = c.id
FROM market.product_categories c
WHERE c.slug = 'raw' AND p.slug = 'aluminum-ingot';
