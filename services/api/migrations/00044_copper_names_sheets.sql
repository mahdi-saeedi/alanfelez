-- +goose Up
-- The client's answers on the copper list (2026-11-18):
--   * names as the client wrote them: «لوله مسی ضخامت 0.63 سایز 3/4 اینچ», «تسمه مسی سایز 80 ضخامت 5 با خلوص 99.9%»
--     (no bar length or seller), «کابل افشان 1*16» (no producer) — rows of 00042, not yet on the main site;
--   * «ورق مسی» by thickness and size (the end of the client's second file), a new group;
--   * hidden (owner OK before the main site): «شمش مس» and «بیلت مس» (the client: they are the strips, «تسمه مسی»)
--     and the generic «ورق مسی» (its sizes replace it). Hidden means inactive: rows and price history stay.
UPDATE market.products p SET name_fa = v.name_fa, updated_at = now()
FROM (VALUES
  ('copper-pipe-3-4-0p63', 'لوله مسی ضخامت 0.63 سایز 3/4 اینچ'),
  ('copper-pipe-1-2-0p63', 'لوله مسی ضخامت 0.63 سایز 1/2 اینچ'),
  ('copper-pipe-1-4-0p63', 'لوله مسی ضخامت 0.63 سایز 1/4 اینچ'),
  ('copper-pipe-3-8-0p63', 'لوله مسی ضخامت 0.63 سایز 3/8 اینچ'),
  ('copper-pipe-5-8-0p63', 'لوله مسی ضخامت 0.63 سایز 5/8 اینچ'),
  ('copper-pipe-1-2-0p75', 'لوله مسی ضخامت 0.75 سایز 1/2 اینچ'),
  ('copper-pipe-1-4-0p75', 'لوله مسی ضخامت 0.75 سایز 1/4 اینچ'),
  ('copper-pipe-3-4-0p75', 'لوله مسی ضخامت 0.75 سایز 3/4 اینچ'),
  ('copper-pipe-3-8-0p75', 'لوله مسی ضخامت 0.75 سایز 3/8 اینچ'),
  ('copper-pipe-5-8-0p75', 'لوله مسی ضخامت 0.75 سایز 5/8 اینچ'),
  ('copper-pipe-1-2-0p81', 'لوله مسی ضخامت 0.81 سایز 1/2 اینچ'),
  ('copper-pipe-1-4-0p81', 'لوله مسی ضخامت 0.81 سایز 1/4 اینچ'),
  ('copper-pipe-3-4-0p81', 'لوله مسی ضخامت 0.81 سایز 3/4 اینچ'),
  ('copper-pipe-3-8-0p81', 'لوله مسی ضخامت 0.81 سایز 3/8 اینچ'),
  ('copper-pipe-5-8-0p81', 'لوله مسی ضخامت 0.81 سایز 5/8 اینچ'),
  ('copper-strip-5-80', 'تسمه مسی سایز 80 ضخامت 5 با خلوص 99.9%'),
  ('copper-strip-10-60', 'تسمه مسی سایز 60 ضخامت 10 با خلوص 99.9%'),
  ('copper-strip-10-50', 'تسمه مسی سایز 50 ضخامت 10 با خلوص 99.9%'),
  ('copper-strip-5-50', 'تسمه مسی سایز 50 ضخامت 5 با خلوص 99.9%'),
  ('copper-strip-10-40', 'تسمه مسی سایز 40 ضخامت 10 با خلوص 99.9%'),
  ('copper-strip-10-30', 'تسمه مسی سایز 30 ضخامت 10 با خلوص 99.9%'),
  ('copper-strip-5-25', 'تسمه مسی سایز 25 ضخامت 5 با خلوص 99.9%'),
  ('copper-cable-1x16', 'کابل افشان 1*16'),
  ('copper-cable-1x25', 'کابل افشان 1*25'),
  ('copper-cable-1x35', 'کابل افشان 1*35'),
  ('copper-cable-1x50', 'کابل افشان 1*50'),
  ('copper-cable-1x70', 'کابل افشان 1*70'),
  ('copper-cable-1x95', 'کابل افشان 1*95'),
  ('copper-cable-1x120', 'کابل افشان 1*120'),
  ('copper-cable-1x150', 'کابل افشان 1*150'),
  ('copper-cable-1x185', 'کابل افشان 1*185'),
  ('copper-cable-1x240', 'کابل افشان 1*240'),
  ('copper-cable-1x300', 'کابل افشان 1*300'),
  ('copper-cable-2x1', 'کابل افشان 2*1'),
  ('copper-cable-2x1p5', 'کابل افشان 2*1.5'),
  ('copper-cable-2x2p5', 'کابل افشان 2*2.5'),
  ('copper-cable-2x4', 'کابل افشان 2*4'),
  ('copper-cable-2x6', 'کابل افشان 2*6'),
  ('copper-cable-2x10', 'کابل افشان 2*10'),
  ('copper-cable-2x16', 'کابل افشان 2*16'),
  ('copper-cable-3x1', 'کابل افشان 3*1'),
  ('copper-cable-3x1p5', 'کابل افشان 3*1.5'),
  ('copper-cable-3x2p5', 'کابل افشان 3*2.5'),
  ('copper-cable-3x4', 'کابل افشان 3*4'),
  ('copper-cable-3x6', 'کابل افشان 3*6'),
  ('copper-cable-3x10', 'کابل افشان 3*10'),
  ('copper-cable-3x16', 'کابل افشان 3*16'),
  ('copper-cable-3x16-25', 'کابل افشان 3*16+25'),
  ('copper-cable-3x16-35', 'کابل افشان 3*16+35'),
  ('copper-cable-3x50', 'کابل افشان 3*50'),
  ('copper-cable-3x25-50', 'کابل افشان 3*25+50'),
  ('copper-cable-3x70', 'کابل افشان 3*70'),
  ('copper-cable-3x35-70', 'کابل افشان 3*35+70'),
  ('copper-cable-3x50-95', 'کابل افشان 3*50+95'),
  ('copper-cable-3x70-120', 'کابل افشان 3*70+120'),
  ('copper-cable-4x1', 'کابل افشان 4*1'),
  ('copper-cable-4x1p5', 'کابل افشان 4*1.5'),
  ('copper-cable-4x2p5', 'کابل افشان 4*2.5'),
  ('copper-cable-4x4', 'کابل افشان 4*4'),
  ('copper-cable-4x6', 'کابل افشان 4*6'),
  ('copper-cable-5x1', 'کابل افشان 5*1'),
  ('copper-cable-5x1p5', 'کابل افشان 5*1.5'),
  ('copper-cable-5x2p5', 'کابل افشان 5*2.5'),
  ('copper-cable-5x4', 'کابل افشان 5*4'),
  ('copper-cable-5x6', 'کابل افشان 5*6'),
  ('copper-cable-5x10', 'کابل افشان 5*10'),
  ('copper-cable-5x16', 'کابل افشان 5*16'),
  ('copper-cable-5x25', 'کابل افشان 5*25'),
  ('copper-cable-5x35', 'کابل افشان 5*35')
) AS v (slug, name_fa)
WHERE p.slug = v.slug;

INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, 'ورق مسی', 'Copper sheet', 14
FROM market.metals m JOIN market.product_categories c ON c.slug = 'intermediate'
WHERE m.slug = 'copper'
ON CONFLICT (metal_id, category_id, name_fa) DO NOTHING;

-- One statement (no temporary table, which sqlc would read as a model): the products, then their price rows.
WITH n (slug, name_fa, sort) AS (VALUES
  ('copper-sheet-0p7-2000-660', 'ورق مسی با ضخامت 0.7 و سایز 2000*660', 479),
  ('copper-sheet-1-2000-660', 'ورق مسی با ضخامت 1 و سایز 2000*660', 480),
  ('copper-sheet-1p25-2000-660', 'ورق مسی با ضخامت 1.25 و سایز 2000*660', 481),
  ('copper-sheet-2-2000-660', 'ورق مسی با ضخامت 2 و سایز 2000*660', 482),
  ('copper-sheet-5-2000-660', 'ورق مسی با ضخامت 5 و سایز 2000*660', 483),
  ('copper-sheet-3-2000-660', 'ورق مسی با ضخامت 3 و سایز 2000*660', 484),
  ('copper-sheet-4-2000-660', 'ورق مسی با ضخامت 4 و سایز 2000*660', 485),
  ('copper-sheet-6-2000-660', 'ورق مسی با ضخامت 6 و سایز 2000*660', 486),
  ('copper-sheet-7-2000-660', 'ورق مسی با ضخامت 7 و سایز 2000*660', 487),
  ('copper-sheet-10-2000-660', 'ورق مسی با ضخامت 10 و سایز 2000*660', 488)),
p AS (
  INSERT INTO market.products (slug, metal_id, category_id, name_fa, sort, group_id)
  SELECT n.slug, m.id, c.id, n.name_fa, n.sort, g.id
  FROM n
  JOIN market.metals m ON m.slug = 'copper'
  JOIN market.product_categories c ON c.slug = 'intermediate'
  LEFT JOIN market.product_groups g ON g.metal_id = m.id AND g.category_id = c.id AND g.name_fa = 'ورق مسی'
  ON CONFLICT (slug) DO NOTHING
  RETURNING id, slug
)
INSERT INTO market.price_series (slug, product_id, market_id, currency, unit, is_base, sort)
SELECT n.slug || '-free', p.id, mk.id, 'IRR', 'kg', false, n.sort
FROM n
JOIN p ON p.slug = n.slug
JOIN market.markets mk ON mk.slug = 'free'
ON CONFLICT DO NOTHING;

UPDATE market.products SET active = false, updated_at = now() WHERE slug IN ('copper-ingot', 'copper-billet', 'copper-sheet');
UPDATE market.price_series s SET active = false, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('copper-ingot', 'copper-billet', 'copper-sheet');

-- +goose Down
UPDATE market.price_series s SET active = true, updated_at = now()
FROM market.products p
WHERE p.id = s.product_id AND p.slug IN ('copper-ingot', 'copper-billet', 'copper-sheet');
UPDATE market.products SET active = true, updated_at = now() WHERE slug IN ('copper-ingot', 'copper-billet', 'copper-sheet');
-- Sheet rows only if they never got a price (price points keep a series, and a series its product).
DELETE FROM market.price_series s USING market.products p
WHERE s.product_id = p.id AND p.slug IN ('copper-sheet-0p7-2000-660', 'copper-sheet-1-2000-660', 'copper-sheet-1p25-2000-660', 'copper-sheet-2-2000-660', 'copper-sheet-5-2000-660', 'copper-sheet-3-2000-660', 'copper-sheet-4-2000-660', 'copper-sheet-6-2000-660', 'copper-sheet-7-2000-660', 'copper-sheet-10-2000-660')
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id);
DELETE FROM market.products p
WHERE p.slug IN ('copper-sheet-0p7-2000-660', 'copper-sheet-1-2000-660', 'copper-sheet-1p25-2000-660', 'copper-sheet-2-2000-660', 'copper-sheet-5-2000-660', 'copper-sheet-3-2000-660', 'copper-sheet-4-2000-660', 'copper-sheet-6-2000-660', 'copper-sheet-7-2000-660', 'copper-sheet-10-2000-660')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.product_id = p.id);
DELETE FROM market.product_groups g USING market.metals m
WHERE g.metal_id = m.id AND m.slug = 'copper' AND g.name_fa = 'ورق مسی'
  AND NOT EXISTS (SELECT 1 FROM market.products p WHERE p.group_id = g.id);
UPDATE market.products p SET name_fa = v.name_fa, updated_at = now()
FROM (VALUES
  ('copper-pipe-3-4-0p63', 'لوله مسی 3/4 اینچ ضخامت 0.63'),
  ('copper-pipe-1-2-0p63', 'لوله مسی 1/2 اینچ ضخامت 0.63'),
  ('copper-pipe-1-4-0p63', 'لوله مسی 1/4 اینچ ضخامت 0.63'),
  ('copper-pipe-3-8-0p63', 'لوله مسی 3/8 اینچ ضخامت 0.63'),
  ('copper-pipe-5-8-0p63', 'لوله مسی 5/8 اینچ ضخامت 0.63'),
  ('copper-pipe-1-2-0p75', 'لوله مسی 1/2 اینچ ضخامت 0.75'),
  ('copper-pipe-1-4-0p75', 'لوله مسی 1/4 اینچ ضخامت 0.75'),
  ('copper-pipe-3-4-0p75', 'لوله مسی 3/4 اینچ ضخامت 0.75'),
  ('copper-pipe-3-8-0p75', 'لوله مسی 3/8 اینچ ضخامت 0.75'),
  ('copper-pipe-5-8-0p75', 'لوله مسی 5/8 اینچ ضخامت 0.75'),
  ('copper-pipe-1-2-0p81', 'لوله مسی 1/2 اینچ ضخامت 0.81'),
  ('copper-pipe-1-4-0p81', 'لوله مسی 1/4 اینچ ضخامت 0.81'),
  ('copper-pipe-3-4-0p81', 'لوله مسی 3/4 اینچ ضخامت 0.81'),
  ('copper-pipe-3-8-0p81', 'لوله مسی 3/8 اینچ ضخامت 0.81'),
  ('copper-pipe-5-8-0p81', 'لوله مسی 5/8 اینچ ضخامت 0.81'),
  ('copper-strip-5-80', 'تسمه مسی 5*80 خلوص 99.9% شاخه 4 متری بنگاه تهران'),
  ('copper-strip-10-60', 'تسمه مسی 10*60 خلوص 99.9% شاخه 4 متری بنگاه تهران'),
  ('copper-strip-10-50', 'تسمه مسی 10*50 خلوص 99.9% شاخه 4 متری بنگاه تهران'),
  ('copper-strip-5-50', 'تسمه مسی 5*50 خلوص 99.9% شاخه 4 متری بنگاه تهران'),
  ('copper-strip-10-40', 'تسمه مسی 10*40 خلوص 99.9% شاخه 4 متری بنگاه تهران'),
  ('copper-strip-10-30', 'تسمه مسی 10*30 خلوص 99.9% شاخه 4 متری بنگاه تهران'),
  ('copper-strip-5-25', 'تسمه مسی 5*25 خلوص 99.9% شاخه 4 متری بنگاه تهران'),
  ('copper-cable-1x16', 'کابل افشان 16*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x25', 'کابل افشان 25*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x35', 'کابل افشان 35*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x50', 'کابل افشان 50*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x70', 'کابل افشان 70*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x95', 'کابل افشان 95*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x120', 'کابل افشان 120*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x150', 'کابل افشان 150*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x185', 'کابل افشان 185*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x240', 'کابل افشان 240*1 خراسان (افشار نژاد)'),
  ('copper-cable-1x300', 'کابل افشان 300*1 خراسان (افشار نژاد)'),
  ('copper-cable-2x1', 'کابل افشان 1*2 خراسان (افشار نژاد)'),
  ('copper-cable-2x1p5', 'کابل افشان 1.5*2 خراسان (افشار نژاد)'),
  ('copper-cable-2x2p5', 'کابل افشان 2.5*2 خراسان (افشار نژاد)'),
  ('copper-cable-2x4', 'کابل افشان 4*2 خراسان (افشار نژاد)'),
  ('copper-cable-2x6', 'کابل افشان 6*2 خراسان (افشار نژاد)'),
  ('copper-cable-2x10', 'کابل افشان 10*2 خراسان (افشار نژاد)'),
  ('copper-cable-2x16', 'کابل افشان 16*2 خراسان (افشار نژاد)'),
  ('copper-cable-3x1', 'کابل افشان 1*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x1p5', 'کابل افشان 1.5*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x2p5', 'کابل افشان 2.5*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x4', 'کابل افشان 4*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x6', 'کابل افشان 6*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x10', 'کابل افشان 10*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x16', 'کابل افشان 16*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x16-25', 'کابل افشان 16+25*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x16-35', 'کابل افشان 16+35*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x50', 'کابل افشان 50*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x25-50', 'کابل افشان 25+50*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x70', 'کابل افشان 70*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x35-70', 'کابل افشان 35+70*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x50-95', 'کابل افشان 50+95*3 خراسان (افشار نژاد)'),
  ('copper-cable-3x70-120', 'کابل افشان 70+120*3 خراسان (افشار نژاد)'),
  ('copper-cable-4x1', 'کابل افشان 1*4 خراسان (افشار نژاد)'),
  ('copper-cable-4x1p5', 'کابل افشان 1.5*4 خراسان (افشار نژاد)'),
  ('copper-cable-4x2p5', 'کابل افشان 2.5*4 خراسان (افشار نژاد)'),
  ('copper-cable-4x4', 'کابل افشان 4*4 خراسان (افشار نژاد)'),
  ('copper-cable-4x6', 'کابل افشان 6*4 خراسان (افشار نژاد)'),
  ('copper-cable-5x1', 'کابل افشان 1*5 خراسان (افشار نژاد)'),
  ('copper-cable-5x1p5', 'کابل افشان 1.5*5 خراسان (افشار نژاد)'),
  ('copper-cable-5x2p5', 'کابل افشان 2.5*5 خراسان (افشار نژاد)'),
  ('copper-cable-5x4', 'کابل افشان 4*5 خراسان (افشار نژاد)'),
  ('copper-cable-5x6', 'کابل افشان 6*5 خراسان (افشار نژاد)'),
  ('copper-cable-5x10', 'کابل افشان 10*5 خراسان (افشار نژاد)'),
  ('copper-cable-5x16', 'کابل افشان 16*5 خراسان (افشار نژاد)'),
  ('copper-cable-5x25', 'کابل افشان 25*5 خراسان (افشار نژاد)'),
  ('copper-cable-5x35', 'کابل افشان 35*5 خراسان (افشار نژاد)')
) AS v (slug, name_fa)
WHERE p.slug = v.slug;
