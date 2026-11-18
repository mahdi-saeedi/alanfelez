-- +goose Up
-- The client's copper list (2026-11-18, an Excel file), shaped like the aluminium one (00040): raw materials in three
-- groups (کلوخه مس اکسیدی، سمانته مس، کنسانتره مس سولفیدی) and intermediate products in three (لوله مسی by size and
-- thickness, تسمه مسی, کابل مسی), each sold in «بازار» in Toman/kg, plus the products traded on the Iran Mercantile
-- Exchange, one per traded symbol (grade and producer), in two groups; cathode and low-grade slag go to raw materials.
-- Additive only: existing products, groups and prices are not touched (ON CONFLICT DO NOTHING), and a row appears on the
-- site once it has a price. Nothing happens on a fresh database (no metals yet when migrations run; the seed comes after).
INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, g.name_fa, g.name_en, g.sort
FROM market.metals m,
     (VALUES
       ('raw', 'کلوخه مس اکسیدی', 'Oxide copper ore', 1),
       ('raw', 'سمانته مس', 'Copper cement', 2),
       ('raw', 'کنسانتره مس سولفیدی', 'Sulphide copper concentrate', 3),
       ('intermediate', 'لوله مسی', 'Copper pipe', 11),
       ('intermediate', 'تسمه مسی', 'Copper strip', 12),
       ('intermediate', 'کابل مسی', 'Copper cable', 13),
       ('intermediate', 'مس مفتول بورس کالا', 'IME copper wire rod', 18),
       ('intermediate', 'سیم و مفتول مسی بورس کالا', 'IME copper wire', 19)) AS g (category, name_fa, name_en, sort)
JOIN market.product_categories c ON c.slug = g.category
WHERE m.slug = 'copper'
ON CONFLICT (metal_id, category_id, name_fa) DO NOTHING;

-- One statement (no temporary table, which sqlc would read as a model): the products, then their price rows.
WITH n (slug, name_fa, category, group_fa, market, is_base, sort) AS (VALUES
  ('copper-oxide-ore-0p5', 'کلوخه مس اکسیدی ۰.۵ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 320),
  ('copper-oxide-ore-0p6', 'کلوخه مس اکسیدی ۰.۶ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 321),
  ('copper-oxide-ore-0p7', 'کلوخه مس اکسیدی ۰.۷ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 322),
  ('copper-oxide-ore-0p8', 'کلوخه مس اکسیدی ۰.۸ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 323),
  ('copper-oxide-ore-0p9', 'کلوخه مس اکسیدی ۰.۹ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 324),
  ('copper-oxide-ore-1', 'کلوخه مس اکسیدی ۱ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 325),
  ('copper-oxide-ore-1p1', 'کلوخه مس اکسیدی ۱.۱ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 326),
  ('copper-oxide-ore-1p2', 'کلوخه مس اکسیدی ۱.۲ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 327),
  ('copper-oxide-ore-1p3', 'کلوخه مس اکسیدی ۱.۳ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 328),
  ('copper-oxide-ore-1p4', 'کلوخه مس اکسیدی ۱.۴ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 329),
  ('copper-oxide-ore-1p5', 'کلوخه مس اکسیدی ۱.۵ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 330),
  ('copper-oxide-ore-1p6', 'کلوخه مس اکسیدی ۱.۶ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 331),
  ('copper-oxide-ore-1p7', 'کلوخه مس اکسیدی ۱.۷ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 332),
  ('copper-oxide-ore-1p8', 'کلوخه مس اکسیدی ۱.۸ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 333),
  ('copper-oxide-ore-1p9', 'کلوخه مس اکسیدی ۱.۹ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 334),
  ('copper-oxide-ore-2', 'کلوخه مس اکسیدی ۲ درصد', 'raw', 'کلوخه مس اکسیدی', 'free', false, 335),
  ('copper-cement-lt40', 'سمانته مس زیر ۴۰ درصد', 'raw', 'سمانته مس', 'free', false, 336),
  ('copper-cement-50', 'سمانته مس ۵۰ درصد', 'raw', 'سمانته مس', 'free', false, 337),
  ('copper-cement-60', 'سمانته مس ۶۰ درصد', 'raw', 'سمانته مس', 'free', false, 338),
  ('copper-cement-70', 'سمانته مس ۷۰ درصد', 'raw', 'سمانته مس', 'free', false, 339),
  ('copper-cement-80', 'سمانته مس ۸۰ درصد', 'raw', 'سمانته مس', 'free', false, 340),
  ('copper-sulfide-conc-20', 'کنسانتره مس سولفیدی ۲۰ درصد', 'raw', 'کنسانتره مس سولفیدی', 'free', false, 341),
  ('copper-sulfide-conc-21', 'کنسانتره مس سولفیدی ۲۱ درصد', 'raw', 'کنسانتره مس سولفیدی', 'free', false, 342),
  ('copper-sulfide-conc-22', 'کنسانتره مس سولفیدی ۲۲ درصد', 'raw', 'کنسانتره مس سولفیدی', 'free', false, 343),
  ('copper-sulfide-conc-23', 'کنسانتره مس سولفیدی ۲۳ درصد', 'raw', 'کنسانتره مس سولفیدی', 'free', false, 344),
  ('copper-sulfide-conc-24', 'کنسانتره مس سولفیدی ۲۴ درصد', 'raw', 'کنسانتره مس سولفیدی', 'free', false, 345),
  ('copper-sulfide-conc-25', 'کنسانتره مس سولفیدی ۲۵ درصد', 'raw', 'کنسانتره مس سولفیدی', 'free', false, 346),
  ('copper-pipe-3-4-0p63', 'لوله مسی 3/4 اینچ ضخامت 0.63', 'intermediate', 'لوله مسی', 'free', false, 410),
  ('copper-pipe-1-2-0p63', 'لوله مسی 1/2 اینچ ضخامت 0.63', 'intermediate', 'لوله مسی', 'free', false, 411),
  ('copper-pipe-1-4-0p63', 'لوله مسی 1/4 اینچ ضخامت 0.63', 'intermediate', 'لوله مسی', 'free', false, 412),
  ('copper-pipe-3-8-0p63', 'لوله مسی 3/8 اینچ ضخامت 0.63', 'intermediate', 'لوله مسی', 'free', false, 413),
  ('copper-pipe-5-8-0p63', 'لوله مسی 5/8 اینچ ضخامت 0.63', 'intermediate', 'لوله مسی', 'free', false, 414),
  ('copper-pipe-1-2-0p75', 'لوله مسی 1/2 اینچ ضخامت 0.75', 'intermediate', 'لوله مسی', 'free', false, 415),
  ('copper-pipe-1-4-0p75', 'لوله مسی 1/4 اینچ ضخامت 0.75', 'intermediate', 'لوله مسی', 'free', false, 416),
  ('copper-pipe-3-4-0p75', 'لوله مسی 3/4 اینچ ضخامت 0.75', 'intermediate', 'لوله مسی', 'free', false, 417),
  ('copper-pipe-3-8-0p75', 'لوله مسی 3/8 اینچ ضخامت 0.75', 'intermediate', 'لوله مسی', 'free', false, 418),
  ('copper-pipe-5-8-0p75', 'لوله مسی 5/8 اینچ ضخامت 0.75', 'intermediate', 'لوله مسی', 'free', false, 419),
  ('copper-pipe-1-2-0p81', 'لوله مسی 1/2 اینچ ضخامت 0.81', 'intermediate', 'لوله مسی', 'free', false, 420),
  ('copper-pipe-1-4-0p81', 'لوله مسی 1/4 اینچ ضخامت 0.81', 'intermediate', 'لوله مسی', 'free', false, 421),
  ('copper-pipe-3-4-0p81', 'لوله مسی 3/4 اینچ ضخامت 0.81', 'intermediate', 'لوله مسی', 'free', false, 422),
  ('copper-pipe-3-8-0p81', 'لوله مسی 3/8 اینچ ضخامت 0.81', 'intermediate', 'لوله مسی', 'free', false, 423),
  ('copper-pipe-5-8-0p81', 'لوله مسی 5/8 اینچ ضخامت 0.81', 'intermediate', 'لوله مسی', 'free', false, 424),
  ('copper-strip-5-80', 'تسمه مسی 5*80 خلوص 99.9% شاخه 4 متری بنگاه تهران', 'intermediate', 'تسمه مسی', 'free', false, 425),
  ('copper-strip-10-60', 'تسمه مسی 10*60 خلوص 99.9% شاخه 4 متری بنگاه تهران', 'intermediate', 'تسمه مسی', 'free', false, 426),
  ('copper-strip-10-50', 'تسمه مسی 10*50 خلوص 99.9% شاخه 4 متری بنگاه تهران', 'intermediate', 'تسمه مسی', 'free', false, 427),
  ('copper-strip-5-50', 'تسمه مسی 5*50 خلوص 99.9% شاخه 4 متری بنگاه تهران', 'intermediate', 'تسمه مسی', 'free', false, 428),
  ('copper-strip-10-40', 'تسمه مسی 10*40 خلوص 99.9% شاخه 4 متری بنگاه تهران', 'intermediate', 'تسمه مسی', 'free', false, 429),
  ('copper-strip-10-30', 'تسمه مسی 10*30 خلوص 99.9% شاخه 4 متری بنگاه تهران', 'intermediate', 'تسمه مسی', 'free', false, 430),
  ('copper-strip-5-25', 'تسمه مسی 5*25 خلوص 99.9% شاخه 4 متری بنگاه تهران', 'intermediate', 'تسمه مسی', 'free', false, 431),
  ('copper-cable-1x16', 'کابل افشان 16*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 432),
  ('copper-cable-1x25', 'کابل افشان 25*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 433),
  ('copper-cable-1x35', 'کابل افشان 35*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 434),
  ('copper-cable-1x50', 'کابل افشان 50*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 435),
  ('copper-cable-1x70', 'کابل افشان 70*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 436),
  ('copper-cable-1x95', 'کابل افشان 95*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 437),
  ('copper-cable-1x120', 'کابل افشان 120*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 438),
  ('copper-cable-1x150', 'کابل افشان 150*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 439),
  ('copper-cable-1x185', 'کابل افشان 185*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 440),
  ('copper-cable-1x240', 'کابل افشان 240*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 441),
  ('copper-cable-1x300', 'کابل افشان 300*1 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 442),
  ('copper-cable-2x1', 'کابل افشان 1*2 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 443),
  ('copper-cable-2x1p5', 'کابل افشان 1.5*2 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 444),
  ('copper-cable-2x2p5', 'کابل افشان 2.5*2 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 445),
  ('copper-cable-2x4', 'کابل افشان 4*2 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 446),
  ('copper-cable-2x6', 'کابل افشان 6*2 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 447),
  ('copper-cable-2x10', 'کابل افشان 10*2 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 448),
  ('copper-cable-2x16', 'کابل افشان 16*2 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 449),
  ('copper-cable-3x1', 'کابل افشان 1*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 450),
  ('copper-cable-3x1p5', 'کابل افشان 1.5*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 451),
  ('copper-cable-3x2p5', 'کابل افشان 2.5*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 452),
  ('copper-cable-3x4', 'کابل افشان 4*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 453),
  ('copper-cable-3x6', 'کابل افشان 6*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 454),
  ('copper-cable-3x10', 'کابل افشان 10*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 455),
  ('copper-cable-3x16', 'کابل افشان 16*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 456),
  ('copper-cable-3x16-25', 'کابل افشان 16+25*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 457),
  ('copper-cable-3x16-35', 'کابل افشان 16+35*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 458),
  ('copper-cable-3x50', 'کابل افشان 50*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 459),
  ('copper-cable-3x25-50', 'کابل افشان 25+50*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 460),
  ('copper-cable-3x70', 'کابل افشان 70*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 461),
  ('copper-cable-3x35-70', 'کابل افشان 35+70*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 462),
  ('copper-cable-3x50-95', 'کابل افشان 50+95*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 463),
  ('copper-cable-3x70-120', 'کابل افشان 70+120*3 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 464),
  ('copper-cable-4x1', 'کابل افشان 1*4 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 465),
  ('copper-cable-4x1p5', 'کابل افشان 1.5*4 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 466),
  ('copper-cable-4x2p5', 'کابل افشان 2.5*4 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 467),
  ('copper-cable-4x4', 'کابل افشان 4*4 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 468),
  ('copper-cable-4x6', 'کابل افشان 6*4 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 469),
  ('copper-cable-5x1', 'کابل افشان 1*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 470),
  ('copper-cable-5x1p5', 'کابل افشان 1.5*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 471),
  ('copper-cable-5x2p5', 'کابل افشان 2.5*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 472),
  ('copper-cable-5x4', 'کابل افشان 4*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 473),
  ('copper-cable-5x6', 'کابل افشان 6*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 474),
  ('copper-cable-5x10', 'کابل افشان 10*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 475),
  ('copper-cable-5x16', 'کابل افشان 16*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 476),
  ('copper-cable-5x25', 'کابل افشان 25*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 477),
  ('copper-cable-5x35', 'کابل افشان 35*5 خراسان (افشار نژاد)', 'intermediate', 'کابل مسی', 'free', false, 478),
  ('copper-ime-nci-cr08ab', 'مس مفتول (ملی صنایع مس ایران)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 380),
  ('copper-ime-znkm-cr018oo', 'سیم و مفتول مسی (ژرف نگار کاوش مهر)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 381),
  ('copper-ime-srbk-cr08ab', 'مس مفتول (صنایع مس سان راد خراسان)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 382),
  ('copper-ime-cwd-cr018oo', 'سیم و مفتول مسی (دنیای مس کاشان)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 383),
  ('copper-ime-simc-cr018oo', 'سیم و مفتول مسی (تولیدی سیم و کابل تبریز سیمکات)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 384),
  ('copper-ime-ofac-cr018oo', 'سیم و مفتول مسی (گروه صنایع کابلسازی افق البرز)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 385),
  ('copper-ime-stgi-cr018oo', 'سیم و مفتول مسی (گروه تولیدی و بازرگانی ساتراپ ثقفی)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 386),
  ('copper-ime-kzc-cr018oo', 'سیم و مفتول مسی (زر کابل کرمان)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 387),
  ('copper-ime-jsnw-cr018oo', 'سیم و مفتول مسی (سیم و کابل جهان شاهین نوین)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 388),
  ('copper-ime-krci-cr08ab', 'مس مفتول (صنایع مس کاوه)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 389),
  ('copper-ime-sefa-cr08ab', 'مس مفتول (گروه صنعتی سپهر فدک آریا)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 390),
  ('copper-ime-simc-cr08ab', 'مس مفتول (تولیدی سیم و کابل تبریز سیمکات)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 391),
  ('copper-ime-acwi-cr08ab', 'مس مفتول (صنایع مس مفتولی ابهر)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 392),
  ('copper-ime-asf-cr08ab', 'مس مفتول (آریا کابل فدک)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 393),
  ('copper-ime-nci-oaccaa', 'مس کاتد (ملی صنایع مس ایران)', 'raw', NULL, 'ime', true, 310),
  ('copper-ime-nci-slg', 'مس کم عیار (سرباره G) (ملی صنایع مس ایران)', 'raw', NULL, 'ime', true, 310),
  ('copper-ime-cwd-cr08ab', 'مس مفتول (دنیای مس کاشان)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 396),
  ('copper-ime-ofac-cr08ab', 'مس مفتول (گروه صنایع کابلسازی افق البرز)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 397),
  ('copper-ime-kzc-cr08ab', 'مس مفتول (زر کابل کرمان)', 'intermediate', 'مس مفتول بورس کالا', 'ime', true, 398),
  ('copper-ime-aek-cr018oo', 'سیم و مفتول مسی (افلاک الکتریک خراسان)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 399),
  ('copper-ime-sefa-cr018oo', 'سیم و مفتول مسی (گروه صنعتی سپهر فدک آریا)', 'intermediate', 'سیم و مفتول مسی بورس کالا', 'ime', true, 400)),
p AS (
  INSERT INTO market.products (slug, metal_id, category_id, name_fa, sort, group_id)
  SELECT n.slug, m.id, c.id, n.name_fa, n.sort, g.id
  FROM n
  JOIN market.metals m ON m.slug = 'copper'
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
WHERE s.product_id = p.id AND p.slug IN ('copper-oxide-ore-0p5', 'copper-oxide-ore-0p6', 'copper-oxide-ore-0p7', 'copper-oxide-ore-0p8', 'copper-oxide-ore-0p9', 'copper-oxide-ore-1', 'copper-oxide-ore-1p1', 'copper-oxide-ore-1p2', 'copper-oxide-ore-1p3', 'copper-oxide-ore-1p4', 'copper-oxide-ore-1p5', 'copper-oxide-ore-1p6', 'copper-oxide-ore-1p7', 'copper-oxide-ore-1p8', 'copper-oxide-ore-1p9', 'copper-oxide-ore-2', 'copper-cement-lt40', 'copper-cement-50', 'copper-cement-60', 'copper-cement-70', 'copper-cement-80', 'copper-sulfide-conc-20', 'copper-sulfide-conc-21', 'copper-sulfide-conc-22', 'copper-sulfide-conc-23', 'copper-sulfide-conc-24', 'copper-sulfide-conc-25', 'copper-pipe-3-4-0p63', 'copper-pipe-1-2-0p63', 'copper-pipe-1-4-0p63', 'copper-pipe-3-8-0p63', 'copper-pipe-5-8-0p63', 'copper-pipe-1-2-0p75', 'copper-pipe-1-4-0p75', 'copper-pipe-3-4-0p75', 'copper-pipe-3-8-0p75', 'copper-pipe-5-8-0p75', 'copper-pipe-1-2-0p81', 'copper-pipe-1-4-0p81', 'copper-pipe-3-4-0p81', 'copper-pipe-3-8-0p81', 'copper-pipe-5-8-0p81', 'copper-strip-5-80', 'copper-strip-10-60', 'copper-strip-10-50', 'copper-strip-5-50', 'copper-strip-10-40', 'copper-strip-10-30', 'copper-strip-5-25', 'copper-cable-1x16', 'copper-cable-1x25', 'copper-cable-1x35', 'copper-cable-1x50', 'copper-cable-1x70', 'copper-cable-1x95', 'copper-cable-1x120', 'copper-cable-1x150', 'copper-cable-1x185', 'copper-cable-1x240', 'copper-cable-1x300', 'copper-cable-2x1', 'copper-cable-2x1p5', 'copper-cable-2x2p5', 'copper-cable-2x4', 'copper-cable-2x6', 'copper-cable-2x10', 'copper-cable-2x16', 'copper-cable-3x1', 'copper-cable-3x1p5', 'copper-cable-3x2p5', 'copper-cable-3x4', 'copper-cable-3x6', 'copper-cable-3x10', 'copper-cable-3x16', 'copper-cable-3x16-25', 'copper-cable-3x16-35', 'copper-cable-3x50', 'copper-cable-3x25-50', 'copper-cable-3x70', 'copper-cable-3x35-70', 'copper-cable-3x50-95', 'copper-cable-3x70-120', 'copper-cable-4x1', 'copper-cable-4x1p5', 'copper-cable-4x2p5', 'copper-cable-4x4', 'copper-cable-4x6', 'copper-cable-5x1', 'copper-cable-5x1p5', 'copper-cable-5x2p5', 'copper-cable-5x4', 'copper-cable-5x6', 'copper-cable-5x10', 'copper-cable-5x16', 'copper-cable-5x25', 'copper-cable-5x35', 'copper-ime-nci-cr08ab', 'copper-ime-znkm-cr018oo', 'copper-ime-srbk-cr08ab', 'copper-ime-cwd-cr018oo', 'copper-ime-simc-cr018oo', 'copper-ime-ofac-cr018oo', 'copper-ime-stgi-cr018oo', 'copper-ime-kzc-cr018oo', 'copper-ime-jsnw-cr018oo', 'copper-ime-krci-cr08ab', 'copper-ime-sefa-cr08ab', 'copper-ime-simc-cr08ab', 'copper-ime-acwi-cr08ab', 'copper-ime-asf-cr08ab', 'copper-ime-nci-oaccaa', 'copper-ime-nci-slg', 'copper-ime-cwd-cr08ab', 'copper-ime-ofac-cr08ab', 'copper-ime-kzc-cr08ab', 'copper-ime-aek-cr018oo', 'copper-ime-sefa-cr018oo')
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id);
DELETE FROM market.products p
WHERE p.slug IN ('copper-oxide-ore-0p5', 'copper-oxide-ore-0p6', 'copper-oxide-ore-0p7', 'copper-oxide-ore-0p8', 'copper-oxide-ore-0p9', 'copper-oxide-ore-1', 'copper-oxide-ore-1p1', 'copper-oxide-ore-1p2', 'copper-oxide-ore-1p3', 'copper-oxide-ore-1p4', 'copper-oxide-ore-1p5', 'copper-oxide-ore-1p6', 'copper-oxide-ore-1p7', 'copper-oxide-ore-1p8', 'copper-oxide-ore-1p9', 'copper-oxide-ore-2', 'copper-cement-lt40', 'copper-cement-50', 'copper-cement-60', 'copper-cement-70', 'copper-cement-80', 'copper-sulfide-conc-20', 'copper-sulfide-conc-21', 'copper-sulfide-conc-22', 'copper-sulfide-conc-23', 'copper-sulfide-conc-24', 'copper-sulfide-conc-25', 'copper-pipe-3-4-0p63', 'copper-pipe-1-2-0p63', 'copper-pipe-1-4-0p63', 'copper-pipe-3-8-0p63', 'copper-pipe-5-8-0p63', 'copper-pipe-1-2-0p75', 'copper-pipe-1-4-0p75', 'copper-pipe-3-4-0p75', 'copper-pipe-3-8-0p75', 'copper-pipe-5-8-0p75', 'copper-pipe-1-2-0p81', 'copper-pipe-1-4-0p81', 'copper-pipe-3-4-0p81', 'copper-pipe-3-8-0p81', 'copper-pipe-5-8-0p81', 'copper-strip-5-80', 'copper-strip-10-60', 'copper-strip-10-50', 'copper-strip-5-50', 'copper-strip-10-40', 'copper-strip-10-30', 'copper-strip-5-25', 'copper-cable-1x16', 'copper-cable-1x25', 'copper-cable-1x35', 'copper-cable-1x50', 'copper-cable-1x70', 'copper-cable-1x95', 'copper-cable-1x120', 'copper-cable-1x150', 'copper-cable-1x185', 'copper-cable-1x240', 'copper-cable-1x300', 'copper-cable-2x1', 'copper-cable-2x1p5', 'copper-cable-2x2p5', 'copper-cable-2x4', 'copper-cable-2x6', 'copper-cable-2x10', 'copper-cable-2x16', 'copper-cable-3x1', 'copper-cable-3x1p5', 'copper-cable-3x2p5', 'copper-cable-3x4', 'copper-cable-3x6', 'copper-cable-3x10', 'copper-cable-3x16', 'copper-cable-3x16-25', 'copper-cable-3x16-35', 'copper-cable-3x50', 'copper-cable-3x25-50', 'copper-cable-3x70', 'copper-cable-3x35-70', 'copper-cable-3x50-95', 'copper-cable-3x70-120', 'copper-cable-4x1', 'copper-cable-4x1p5', 'copper-cable-4x2p5', 'copper-cable-4x4', 'copper-cable-4x6', 'copper-cable-5x1', 'copper-cable-5x1p5', 'copper-cable-5x2p5', 'copper-cable-5x4', 'copper-cable-5x6', 'copper-cable-5x10', 'copper-cable-5x16', 'copper-cable-5x25', 'copper-cable-5x35', 'copper-ime-nci-cr08ab', 'copper-ime-znkm-cr018oo', 'copper-ime-srbk-cr08ab', 'copper-ime-cwd-cr018oo', 'copper-ime-simc-cr018oo', 'copper-ime-ofac-cr018oo', 'copper-ime-stgi-cr018oo', 'copper-ime-kzc-cr018oo', 'copper-ime-jsnw-cr018oo', 'copper-ime-krci-cr08ab', 'copper-ime-sefa-cr08ab', 'copper-ime-simc-cr08ab', 'copper-ime-acwi-cr08ab', 'copper-ime-asf-cr08ab', 'copper-ime-nci-oaccaa', 'copper-ime-nci-slg', 'copper-ime-cwd-cr08ab', 'copper-ime-ofac-cr08ab', 'copper-ime-kzc-cr08ab', 'copper-ime-aek-cr018oo', 'copper-ime-sefa-cr018oo')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.product_id = p.id);
DELETE FROM market.product_groups g USING market.metals m
WHERE g.metal_id = m.id AND m.slug = 'copper' AND g.name_fa IN ('کلوخه مس اکسیدی', 'سمانته مس', 'کنسانتره مس سولفیدی', 'لوله مسی', 'تسمه مسی', 'کابل مسی', 'مس مفتول بورس کالا', 'سیم و مفتول مسی بورس کالا')
  AND NOT EXISTS (SELECT 1 FROM market.products p WHERE p.group_id = g.id);
