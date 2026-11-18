-- +goose Up
-- The client (2026-11-18): the ticker shows one average per IME group, so a group must hold one kind of product.
--   * aluminium: «شمش و آلیاژ بورس کالا» splits into «شمش آلومینیوم بورس کالا» (the 1000p grades) and «آلیاژ آلومینیوم
--     بورس کالا» (AS9U3, ADC12, LM2), so the ticker's ingot average holds ingots only;
--   * copper: the IME cathode («مس کاتد (ملی صنایع مس ایران)») is a product traded on the IME, shown with the other IME
--     rows on top instead of under «مواد اولیه معدنی».
-- These rows are from 00040/00042 (no prices of their own on the main site yet); nothing is hidden or deleted.
UPDATE market.product_groups g SET name_fa = 'شمش آلومینیوم بورس کالا', name_en = 'IME aluminum ingot'
FROM market.metals m
WHERE g.metal_id = m.id AND m.slug = 'aluminum' AND g.name_fa = 'شمش و آلیاژ بورس کالا';

UPDATE market.product_groups g SET sort = 20
FROM market.metals m
WHERE g.metal_id = m.id AND m.slug = 'aluminum' AND g.name_fa = 'بیلت و مفتول بورس کالا';

INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, 'آلیاژ آلومینیوم بورس کالا', 'IME aluminum alloy', 19
FROM market.metals m JOIN market.product_categories c ON c.slug = 'intermediate'
WHERE m.slug = 'aluminum'
ON CONFLICT (metal_id, category_id, name_fa) DO NOTHING;

UPDATE market.products p SET group_id = g.id, updated_at = now()
FROM market.product_groups g JOIN market.metals m ON m.id = g.metal_id
WHERE m.slug = 'aluminum' AND g.name_fa = 'آلیاژ آلومینیوم بورس کالا'
  AND p.slug IN ('aluminum-ime-aagp-aps9u32', 'aluminum-ime-aagp-apdc122', 'aluminum-ime-aagp-aplm2p2', 'aluminum-ime-spal-aps9u32');

UPDATE market.products p SET category_id = c.id, updated_at = now()
FROM market.product_categories c
WHERE c.slug = 'intermediate' AND p.slug = 'copper-ime-nci-oaccaa';

-- +goose Down
UPDATE market.products p SET category_id = c.id, updated_at = now()
FROM market.product_categories c
WHERE c.slug = 'raw' AND p.slug = 'copper-ime-nci-oaccaa';

UPDATE market.products p SET group_id = g.id, updated_at = now()
FROM market.product_groups g JOIN market.metals m ON m.id = g.metal_id
WHERE m.slug = 'aluminum' AND g.name_fa = 'شمش آلومینیوم بورس کالا'
  AND p.slug IN ('aluminum-ime-aagp-aps9u32', 'aluminum-ime-aagp-apdc122', 'aluminum-ime-aagp-aplm2p2', 'aluminum-ime-spal-aps9u32');

DELETE FROM market.product_groups g USING market.metals m
WHERE g.metal_id = m.id AND m.slug = 'aluminum' AND g.name_fa = 'آلیاژ آلومینیوم بورس کالا'
  AND NOT EXISTS (SELECT 1 FROM market.products p WHERE p.group_id = g.id);

UPDATE market.product_groups g SET sort = 19
FROM market.metals m
WHERE g.metal_id = m.id AND m.slug = 'aluminum' AND g.name_fa = 'بیلت و مفتول بورس کالا';

UPDATE market.product_groups g SET name_fa = 'شمش و آلیاژ بورس کالا', name_en = 'IME ingot and alloys'
FROM market.metals m
WHERE g.metal_id = m.id AND m.slug = 'aluminum' AND g.name_fa = 'شمش آلومینیوم بورس کالا';
