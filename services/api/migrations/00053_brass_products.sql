-- +goose Up
-- The client's brass list (2026-11-19, an Excel file), shaped like the other metals. Brass is an alloy: no raw materials
-- of its own and no IME trades (client), so the page has the world price, the intermediate products in «بازار» in four
-- groups, named as the client asked («لوله برنجی سایز 22/13», «ورق برنجی ضخامت 0.3 میلیمتر با ابعاد 660*2000 آلیاژ 70b
-- به صورت شیت», «میلگرد برنجی قطر 30 میلیمتر», «تسمه برنجی 25*25»), and one scrap row the file adds («ته میل برنجی»).
-- Additive only (ON CONFLICT DO NOTHING); a row appears on the site once it has a price. Nothing happens on a fresh
-- database.
INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, g.name_fa, g.name_en, g.sort
FROM market.metals m JOIN market.product_categories c ON c.slug = 'intermediate',
     (VALUES
       ('لوله برنجی', 'Brass pipe', 11),
       ('ورق برنجی', 'Brass sheet', 12),
       ('میلگرد برنجی', 'Brass rod', 13),
       ('تسمه برنجی', 'Brass strip', 14)) AS g (name_fa, name_en, sort)
WHERE m.slug = 'brass'
ON CONFLICT (metal_id, category_id, name_fa) DO NOTHING;

-- One statement (no temporary table, which sqlc would read as a model): the products, then their price rows.
WITH n (slug, name_fa, category, group_fa, sort) AS (VALUES
  ('brass-pipe-22-13', 'لوله برنجی سایز 22/13', 'intermediate', 'لوله برنجی', 410),
  ('brass-pipe-27-15', 'لوله برنجی سایز 27/15', 'intermediate', 'لوله برنجی', 411),
  ('brass-pipe-30-9', 'لوله برنجی سایز 30/9', 'intermediate', 'لوله برنجی', 412),
  ('brass-pipe-30-15', 'لوله برنجی سایز 30/15', 'intermediate', 'لوله برنجی', 413),
  ('brass-pipe-33-27', 'لوله برنجی سایز 33/27', 'intermediate', 'لوله برنجی', 414),
  ('brass-pipe-35-20', 'لوله برنجی سایز 35/20', 'intermediate', 'لوله برنجی', 415),
  ('brass-pipe-40-20', 'لوله برنجی سایز 40/20', 'intermediate', 'لوله برنجی', 416),
  ('brass-pipe-40-25', 'لوله برنجی سایز 40/25', 'intermediate', 'لوله برنجی', 417),
  ('brass-pipe-42-27', 'لوله برنجی سایز 42/27', 'intermediate', 'لوله برنجی', 418),
  ('brass-pipe-45-20', 'لوله برنجی سایز 45/20', 'intermediate', 'لوله برنجی', 419),
  ('brass-pipe-45-25', 'لوله برنجی سایز 45/25', 'intermediate', 'لوله برنجی', 420),
  ('brass-pipe-45-30', 'لوله برنجی سایز 45/30', 'intermediate', 'لوله برنجی', 421),
  ('brass-pipe-50-25', 'لوله برنجی سایز 50/25', 'intermediate', 'لوله برنجی', 422),
  ('brass-pipe-50-35', 'لوله برنجی سایز 50/35', 'intermediate', 'لوله برنجی', 423),
  ('brass-pipe-60-27', 'لوله برنجی سایز 60/27', 'intermediate', 'لوله برنجی', 424),
  ('brass-pipe-60-40', 'لوله برنجی سایز 60/40', 'intermediate', 'لوله برنجی', 425),
  ('brass-pipe-70-50', 'لوله برنجی سایز 70/50', 'intermediate', 'لوله برنجی', 426),
  ('brass-pipe-80-50', 'لوله برنجی سایز 80/50', 'intermediate', 'لوله برنجی', 427),
  ('brass-sheet-0p3-70b', 'ورق برنجی ضخامت 0.3 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 430),
  ('brass-sheet-0p3-65b', 'ورق برنجی ضخامت 0.3 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 431),
  ('brass-sheet-0p4-65b', 'ورق برنجی ضخامت 0.4 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 432),
  ('brass-sheet-0p4-70b', 'ورق برنجی ضخامت 0.4 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 433),
  ('brass-sheet-0p5-65b', 'ورق برنجی ضخامت 0.5 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 434),
  ('brass-sheet-0p5-70b', 'ورق برنجی ضخامت 0.5 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 435),
  ('brass-sheet-0p6-70b', 'ورق برنجی ضخامت 0.6 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 436),
  ('brass-sheet-0p6-65b', 'ورق برنجی ضخامت 0.6 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 437),
  ('brass-sheet-0p7-70b', 'ورق برنجی ضخامت 0.7 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 438),
  ('brass-sheet-0p7-65b', 'ورق برنجی ضخامت 0.7 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 439),
  ('brass-sheet-0p8-70b', 'ورق برنجی ضخامت 0.8 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 440),
  ('brass-sheet-0p8-65b', 'ورق برنجی ضخامت 0.8 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 441),
  ('brass-sheet-0p9-70b', 'ورق برنجی ضخامت 0.9 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 442),
  ('brass-sheet-0p9-65b', 'ورق برنجی ضخامت 0.9 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 443),
  ('brass-sheet-1-70b', 'ورق برنجی ضخامت 1 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 444),
  ('brass-sheet-1-65b', 'ورق برنجی ضخامت 1 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 445),
  ('brass-sheet-2-70b', 'ورق برنجی ضخامت 2 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 446),
  ('brass-sheet-2-65b', 'ورق برنجی ضخامت 2 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 447),
  ('brass-sheet-3-65b', 'ورق برنجی ضخامت 3 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 448),
  ('brass-sheet-3-70b', 'ورق برنجی ضخامت 3 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 449),
  ('brass-sheet-4-70b', 'ورق برنجی ضخامت 4 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 450),
  ('brass-sheet-4-65b', 'ورق برنجی ضخامت 4 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 451),
  ('brass-sheet-5-70b', 'ورق برنجی ضخامت 5 میلیمتر با ابعاد 660*2000 آلیاژ 70b به صورت شیت', 'intermediate', 'ورق برنجی', 452),
  ('brass-sheet-5-65b', 'ورق برنجی ضخامت 5 میلیمتر با ابعاد 660*2000 آلیاژ 65b به صورت شیت', 'intermediate', 'ورق برنجی', 453),
  ('brass-rod-3', 'میلگرد برنجی قطر 3 میلیمتر', 'intermediate', 'میلگرد برنجی', 460),
  ('brass-rod-4', 'میلگرد برنجی قطر 4 میلیمتر', 'intermediate', 'میلگرد برنجی', 461),
  ('brass-rod-5', 'میلگرد برنجی قطر 5 میلیمتر', 'intermediate', 'میلگرد برنجی', 462),
  ('brass-rod-6', 'میلگرد برنجی قطر 6 میلیمتر', 'intermediate', 'میلگرد برنجی', 463),
  ('brass-rod-7', 'میلگرد برنجی قطر 7 میلیمتر', 'intermediate', 'میلگرد برنجی', 464),
  ('brass-rod-8', 'میلگرد برنجی قطر 8 میلیمتر', 'intermediate', 'میلگرد برنجی', 465),
  ('brass-rod-9', 'میلگرد برنجی قطر 9 میلیمتر', 'intermediate', 'میلگرد برنجی', 466),
  ('brass-rod-10', 'میلگرد برنجی قطر 10 میلیمتر', 'intermediate', 'میلگرد برنجی', 467),
  ('brass-rod-11', 'میلگرد برنجی قطر 11 میلیمتر', 'intermediate', 'میلگرد برنجی', 468),
  ('brass-rod-12', 'میلگرد برنجی قطر 12 میلیمتر', 'intermediate', 'میلگرد برنجی', 469),
  ('brass-rod-13', 'میلگرد برنجی قطر 13 میلیمتر', 'intermediate', 'میلگرد برنجی', 470),
  ('brass-rod-14', 'میلگرد برنجی قطر 14 میلیمتر', 'intermediate', 'میلگرد برنجی', 471),
  ('brass-rod-15', 'میلگرد برنجی قطر 15 میلیمتر', 'intermediate', 'میلگرد برنجی', 472),
  ('brass-rod-16', 'میلگرد برنجی قطر 16 میلیمتر', 'intermediate', 'میلگرد برنجی', 473),
  ('brass-rod-17', 'میلگرد برنجی قطر 17 میلیمتر', 'intermediate', 'میلگرد برنجی', 474),
  ('brass-rod-18', 'میلگرد برنجی قطر 18 میلیمتر', 'intermediate', 'میلگرد برنجی', 475),
  ('brass-rod-19', 'میلگرد برنجی قطر 19 میلیمتر', 'intermediate', 'میلگرد برنجی', 476),
  ('brass-rod-20', 'میلگرد برنجی قطر 20 میلیمتر', 'intermediate', 'میلگرد برنجی', 477),
  ('brass-rod-22', 'میلگرد برنجی قطر 22 میلیمتر', 'intermediate', 'میلگرد برنجی', 478),
  ('brass-rod-25', 'میلگرد برنجی قطر 25 میلیمتر', 'intermediate', 'میلگرد برنجی', 479),
  ('brass-rod-26', 'میلگرد برنجی قطر 26 میلیمتر', 'intermediate', 'میلگرد برنجی', 480),
  ('brass-rod-28', 'میلگرد برنجی قطر 28 میلیمتر', 'intermediate', 'میلگرد برنجی', 481),
  ('brass-rod-30', 'میلگرد برنجی قطر 30 میلیمتر', 'intermediate', 'میلگرد برنجی', 482),
  ('brass-rod-32', 'میلگرد برنجی قطر 32 میلیمتر', 'intermediate', 'میلگرد برنجی', 483),
  ('brass-rod-34', 'میلگرد برنجی قطر 34 میلیمتر', 'intermediate', 'میلگرد برنجی', 484),
  ('brass-rod-35', 'میلگرد برنجی قطر 35 میلیمتر', 'intermediate', 'میلگرد برنجی', 485),
  ('brass-rod-36', 'میلگرد برنجی قطر 36 میلیمتر', 'intermediate', 'میلگرد برنجی', 486),
  ('brass-rod-38', 'میلگرد برنجی قطر 38 میلیمتر', 'intermediate', 'میلگرد برنجی', 487),
  ('brass-rod-40', 'میلگرد برنجی قطر 40 میلیمتر', 'intermediate', 'میلگرد برنجی', 488),
  ('brass-rod-42', 'میلگرد برنجی قطر 42 میلیمتر', 'intermediate', 'میلگرد برنجی', 489),
  ('brass-rod-45', 'میلگرد برنجی قطر 45 میلیمتر', 'intermediate', 'میلگرد برنجی', 490),
  ('brass-rod-48', 'میلگرد برنجی قطر 48 میلیمتر', 'intermediate', 'میلگرد برنجی', 491),
  ('brass-rod-50', 'میلگرد برنجی قطر 50 میلیمتر', 'intermediate', 'میلگرد برنجی', 492),
  ('brass-rod-55', 'میلگرد برنجی قطر 55 میلیمتر', 'intermediate', 'میلگرد برنجی', 493),
  ('brass-rod-60', 'میلگرد برنجی قطر 60 میلیمتر', 'intermediate', 'میلگرد برنجی', 494),
  ('brass-rod-65', 'میلگرد برنجی قطر 65 میلیمتر', 'intermediate', 'میلگرد برنجی', 495),
  ('brass-rod-70', 'میلگرد برنجی قطر 70 میلیمتر', 'intermediate', 'میلگرد برنجی', 496),
  ('brass-rod-75', 'میلگرد برنجی قطر 75 میلیمتر', 'intermediate', 'میلگرد برنجی', 497),
  ('brass-rod-80', 'میلگرد برنجی قطر 80 میلیمتر', 'intermediate', 'میلگرد برنجی', 498),
  ('brass-rod-85', 'میلگرد برنجی قطر 85 میلیمتر', 'intermediate', 'میلگرد برنجی', 499),
  ('brass-rod-90', 'میلگرد برنجی قطر 90 میلیمتر', 'intermediate', 'میلگرد برنجی', 500),
  ('brass-rod-95', 'میلگرد برنجی قطر 95 میلیمتر', 'intermediate', 'میلگرد برنجی', 501),
  ('brass-rod-100', 'میلگرد برنجی قطر 100 میلیمتر', 'intermediate', 'میلگرد برنجی', 502),
  ('brass-rod-110', 'میلگرد برنجی قطر 110 میلیمتر', 'intermediate', 'میلگرد برنجی', 503),
  ('brass-rod-120', 'میلگرد برنجی قطر 120 میلیمتر', 'intermediate', 'میلگرد برنجی', 504),
  ('brass-rod-130', 'میلگرد برنجی قطر 130 میلیمتر', 'intermediate', 'میلگرد برنجی', 505),
  ('brass-rod-140', 'میلگرد برنجی قطر 140 میلیمتر', 'intermediate', 'میلگرد برنجی', 506),
  ('brass-rod-150', 'میلگرد برنجی قطر 150 میلیمتر', 'intermediate', 'میلگرد برنجی', 507),
  ('brass-rod-160', 'میلگرد برنجی قطر 160 میلیمتر', 'intermediate', 'میلگرد برنجی', 508),
  ('brass-rod-170', 'میلگرد برنجی قطر 170 میلیمتر', 'intermediate', 'میلگرد برنجی', 509),
  ('brass-rod-180', 'میلگرد برنجی قطر 180 میلیمتر', 'intermediate', 'میلگرد برنجی', 510),
  ('brass-rod-190', 'میلگرد برنجی قطر 190 میلیمتر', 'intermediate', 'میلگرد برنجی', 511),
  ('brass-rod-200', 'میلگرد برنجی قطر 200 میلیمتر', 'intermediate', 'میلگرد برنجی', 512),
  ('brass-rod-210', 'میلگرد برنجی قطر 210 میلیمتر', 'intermediate', 'میلگرد برنجی', 513),
  ('brass-rod-220', 'میلگرد برنجی قطر 220 میلیمتر', 'intermediate', 'میلگرد برنجی', 514),
  ('brass-strip-25x25', 'تسمه برنجی 25*25', 'intermediate', 'تسمه برنجی', 520),
  ('brass-strip-7x7', 'تسمه برنجی 7*7', 'intermediate', 'تسمه برنجی', 521),
  ('brass-strip-30x30', 'تسمه برنجی 30*30', 'intermediate', 'تسمه برنجی', 522),
  ('brass-strip-8x8', 'تسمه برنجی 8*8', 'intermediate', 'تسمه برنجی', 523),
  ('brass-strip-40x40', 'تسمه برنجی 40*40', 'intermediate', 'تسمه برنجی', 524),
  ('brass-strip-9x9', 'تسمه برنجی 9*9', 'intermediate', 'تسمه برنجی', 525),
  ('brass-strip-50x30', 'تسمه برنجی 50*30', 'intermediate', 'تسمه برنجی', 526),
  ('brass-strip-10x10', 'تسمه برنجی 10*10', 'intermediate', 'تسمه برنجی', 527),
  ('brass-strip-50x5', 'تسمه برنجی 50*5', 'intermediate', 'تسمه برنجی', 528),
  ('brass-strip-20x10', 'تسمه برنجی 20*10', 'intermediate', 'تسمه برنجی', 529),
  ('brass-strip-80x5', 'تسمه برنجی 80*5', 'intermediate', 'تسمه برنجی', 530),
  ('brass-strip-30x10', 'تسمه برنجی 30*10', 'intermediate', 'تسمه برنجی', 531),
  ('brass-strip-100x5', 'تسمه برنجی 100*5', 'intermediate', 'تسمه برنجی', 532),
  ('brass-strip-40x10', 'تسمه برنجی 40*10', 'intermediate', 'تسمه برنجی', 533),
  ('brass-strip-100x10', 'تسمه برنجی 100*10', 'intermediate', 'تسمه برنجی', 534),
  ('brass-strip-50x10', 'تسمه برنجی 50*10', 'intermediate', 'تسمه برنجی', 535),
  ('brass-strip-100x20', 'تسمه برنجی 100*20', 'intermediate', 'تسمه برنجی', 536),
  ('brass-strip-12x12', 'تسمه برنجی 12*12', 'intermediate', 'تسمه برنجی', 537),
  ('brass-strip-15x15', 'تسمه برنجی 15*15', 'intermediate', 'تسمه برنجی', 538),
  ('brass-strip-20x20', 'تسمه برنجی 20*20', 'intermediate', 'تسمه برنجی', 539),
  ('brass-strip-30x20', 'تسمه برنجی 30*20', 'intermediate', 'تسمه برنجی', 540),
  ('brass-strip-40x20', 'تسمه برنجی 40*20', 'intermediate', 'تسمه برنجی', 541),
  ('brass-strip-50x20', 'تسمه برنجی 50*20', 'intermediate', 'تسمه برنجی', 542),
  ('brass-strip-60x20', 'تسمه برنجی 60*20', 'intermediate', 'تسمه برنجی', 543),
  ('brass-rod-end-scrap', 'ته میل برنجی', 'scrap', NULL, 507)),
p AS (
  INSERT INTO market.products (slug, metal_id, category_id, name_fa, sort, group_id)
  SELECT n.slug, m.id, c.id, n.name_fa, n.sort, g.id
  FROM n
  JOIN market.metals m ON m.slug = 'brass'
  JOIN market.product_categories c ON c.slug = n.category
  LEFT JOIN market.product_groups g ON g.metal_id = m.id AND g.category_id = c.id AND g.name_fa = n.group_fa
  ON CONFLICT (slug) DO NOTHING
  RETURNING id, slug
)
INSERT INTO market.price_series (slug, product_id, market_id, currency, unit, is_base, sort)
SELECT n.slug || '-free', p.id, mk.id, 'IRR', 'kg', false, n.sort
FROM n
JOIN p ON p.slug = n.slug
JOIN market.markets mk ON mk.slug = 'free'
ON CONFLICT DO NOTHING;

-- +goose Down
-- Only rows that never got a price (price points keep a series, and a series its product).
DELETE FROM market.price_series s USING market.products p
WHERE s.product_id = p.id AND p.slug IN ('brass-pipe-22-13', 'brass-pipe-27-15', 'brass-pipe-30-9', 'brass-pipe-30-15', 'brass-pipe-33-27', 'brass-pipe-35-20', 'brass-pipe-40-20', 'brass-pipe-40-25', 'brass-pipe-42-27', 'brass-pipe-45-20', 'brass-pipe-45-25', 'brass-pipe-45-30', 'brass-pipe-50-25', 'brass-pipe-50-35', 'brass-pipe-60-27', 'brass-pipe-60-40', 'brass-pipe-70-50', 'brass-pipe-80-50', 'brass-sheet-0p3-70b', 'brass-sheet-0p3-65b', 'brass-sheet-0p4-65b', 'brass-sheet-0p4-70b', 'brass-sheet-0p5-65b', 'brass-sheet-0p5-70b', 'brass-sheet-0p6-70b', 'brass-sheet-0p6-65b', 'brass-sheet-0p7-70b', 'brass-sheet-0p7-65b', 'brass-sheet-0p8-70b', 'brass-sheet-0p8-65b', 'brass-sheet-0p9-70b', 'brass-sheet-0p9-65b', 'brass-sheet-1-70b', 'brass-sheet-1-65b', 'brass-sheet-2-70b', 'brass-sheet-2-65b', 'brass-sheet-3-65b', 'brass-sheet-3-70b', 'brass-sheet-4-70b', 'brass-sheet-4-65b', 'brass-sheet-5-70b', 'brass-sheet-5-65b', 'brass-rod-3', 'brass-rod-4', 'brass-rod-5', 'brass-rod-6', 'brass-rod-7', 'brass-rod-8', 'brass-rod-9', 'brass-rod-10', 'brass-rod-11', 'brass-rod-12', 'brass-rod-13', 'brass-rod-14', 'brass-rod-15', 'brass-rod-16', 'brass-rod-17', 'brass-rod-18', 'brass-rod-19', 'brass-rod-20', 'brass-rod-22', 'brass-rod-25', 'brass-rod-26', 'brass-rod-28', 'brass-rod-30', 'brass-rod-32', 'brass-rod-34', 'brass-rod-35', 'brass-rod-36', 'brass-rod-38', 'brass-rod-40', 'brass-rod-42', 'brass-rod-45', 'brass-rod-48', 'brass-rod-50', 'brass-rod-55', 'brass-rod-60', 'brass-rod-65', 'brass-rod-70', 'brass-rod-75', 'brass-rod-80', 'brass-rod-85', 'brass-rod-90', 'brass-rod-95', 'brass-rod-100', 'brass-rod-110', 'brass-rod-120', 'brass-rod-130', 'brass-rod-140', 'brass-rod-150', 'brass-rod-160', 'brass-rod-170', 'brass-rod-180', 'brass-rod-190', 'brass-rod-200', 'brass-rod-210', 'brass-rod-220', 'brass-strip-25x25', 'brass-strip-7x7', 'brass-strip-30x30', 'brass-strip-8x8', 'brass-strip-40x40', 'brass-strip-9x9', 'brass-strip-50x30', 'brass-strip-10x10', 'brass-strip-50x5', 'brass-strip-20x10', 'brass-strip-80x5', 'brass-strip-30x10', 'brass-strip-100x5', 'brass-strip-40x10', 'brass-strip-100x10', 'brass-strip-50x10', 'brass-strip-100x20', 'brass-strip-12x12', 'brass-strip-15x15', 'brass-strip-20x20', 'brass-strip-30x20', 'brass-strip-40x20', 'brass-strip-50x20', 'brass-strip-60x20', 'brass-rod-end-scrap')
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id);
DELETE FROM market.products p
WHERE p.slug IN ('brass-pipe-22-13', 'brass-pipe-27-15', 'brass-pipe-30-9', 'brass-pipe-30-15', 'brass-pipe-33-27', 'brass-pipe-35-20', 'brass-pipe-40-20', 'brass-pipe-40-25', 'brass-pipe-42-27', 'brass-pipe-45-20', 'brass-pipe-45-25', 'brass-pipe-45-30', 'brass-pipe-50-25', 'brass-pipe-50-35', 'brass-pipe-60-27', 'brass-pipe-60-40', 'brass-pipe-70-50', 'brass-pipe-80-50', 'brass-sheet-0p3-70b', 'brass-sheet-0p3-65b', 'brass-sheet-0p4-65b', 'brass-sheet-0p4-70b', 'brass-sheet-0p5-65b', 'brass-sheet-0p5-70b', 'brass-sheet-0p6-70b', 'brass-sheet-0p6-65b', 'brass-sheet-0p7-70b', 'brass-sheet-0p7-65b', 'brass-sheet-0p8-70b', 'brass-sheet-0p8-65b', 'brass-sheet-0p9-70b', 'brass-sheet-0p9-65b', 'brass-sheet-1-70b', 'brass-sheet-1-65b', 'brass-sheet-2-70b', 'brass-sheet-2-65b', 'brass-sheet-3-65b', 'brass-sheet-3-70b', 'brass-sheet-4-70b', 'brass-sheet-4-65b', 'brass-sheet-5-70b', 'brass-sheet-5-65b', 'brass-rod-3', 'brass-rod-4', 'brass-rod-5', 'brass-rod-6', 'brass-rod-7', 'brass-rod-8', 'brass-rod-9', 'brass-rod-10', 'brass-rod-11', 'brass-rod-12', 'brass-rod-13', 'brass-rod-14', 'brass-rod-15', 'brass-rod-16', 'brass-rod-17', 'brass-rod-18', 'brass-rod-19', 'brass-rod-20', 'brass-rod-22', 'brass-rod-25', 'brass-rod-26', 'brass-rod-28', 'brass-rod-30', 'brass-rod-32', 'brass-rod-34', 'brass-rod-35', 'brass-rod-36', 'brass-rod-38', 'brass-rod-40', 'brass-rod-42', 'brass-rod-45', 'brass-rod-48', 'brass-rod-50', 'brass-rod-55', 'brass-rod-60', 'brass-rod-65', 'brass-rod-70', 'brass-rod-75', 'brass-rod-80', 'brass-rod-85', 'brass-rod-90', 'brass-rod-95', 'brass-rod-100', 'brass-rod-110', 'brass-rod-120', 'brass-rod-130', 'brass-rod-140', 'brass-rod-150', 'brass-rod-160', 'brass-rod-170', 'brass-rod-180', 'brass-rod-190', 'brass-rod-200', 'brass-rod-210', 'brass-rod-220', 'brass-strip-25x25', 'brass-strip-7x7', 'brass-strip-30x30', 'brass-strip-8x8', 'brass-strip-40x40', 'brass-strip-9x9', 'brass-strip-50x30', 'brass-strip-10x10', 'brass-strip-50x5', 'brass-strip-20x10', 'brass-strip-80x5', 'brass-strip-30x10', 'brass-strip-100x5', 'brass-strip-40x10', 'brass-strip-100x10', 'brass-strip-50x10', 'brass-strip-100x20', 'brass-strip-12x12', 'brass-strip-15x15', 'brass-strip-20x20', 'brass-strip-30x20', 'brass-strip-40x20', 'brass-strip-50x20', 'brass-strip-60x20', 'brass-rod-end-scrap')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.product_id = p.id);
DELETE FROM market.product_groups g USING market.metals m
WHERE g.metal_id = m.id AND m.slug = 'brass' AND g.name_fa IN ('لوله برنجی', 'ورق برنجی', 'میلگرد برنجی', 'تسمه برنجی')
  AND NOT EXISTS (SELECT 1 FROM market.products p WHERE p.group_id = g.id);
