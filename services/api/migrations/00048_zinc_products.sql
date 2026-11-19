-- +goose Up
-- The client's zinc list (2026-11-19, an Excel file), shaped like aluminium (00040) and copper (00042): raw materials in
-- two groups (کلوخه روی اکسیدی، کلوخه روی سولفیدی, 5–20 %), «ورق گالوانیزه» by thickness and width, each sold in «بازار» in
-- Toman/kg, and the IME ingots, one product per traded symbol (grade and producer; the file's repeated trades once), in
-- «شمش روی بورس کالا». The file's sulphide list has one «اکسیدی ۸%» row where «سولفیدی ۸%» belongs: added as sulphide.
-- Additive only (ON CONFLICT DO NOTHING); a row appears on the site once it has a price. Nothing happens on a fresh
-- database (no metals yet when migrations run; the seed comes after).
INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, g.name_fa, g.name_en, g.sort
FROM market.metals m,
     (VALUES
       ('raw', 'کلوخه روی اکسیدی', 'Oxide zinc ore', 1),
       ('raw', 'کلوخه روی سولفیدی', 'Sulphide zinc ore', 2),
       ('intermediate', 'ورق گالوانیزه', 'Galvanised sheet', 11),
       ('intermediate', 'شمش روی بورس کالا', 'IME zinc ingot', 18)) AS g (category, name_fa, name_en, sort)
JOIN market.product_categories c ON c.slug = g.category
WHERE m.slug = 'zinc'
ON CONFLICT (metal_id, category_id, name_fa) DO NOTHING;

-- One statement (no temporary table, which sqlc would read as a model): the products, then their price rows.
WITH n (slug, name_fa, category, group_fa, market, is_base, sort) AS (VALUES
  ('zinc-oxide-ore-5', 'کلوخه روی اکسیدی با عیار ۵%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 320),
  ('zinc-oxide-ore-6', 'کلوخه روی اکسیدی با عیار ۶%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 321),
  ('zinc-oxide-ore-7', 'کلوخه روی اکسیدی با عیار ۷%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 322),
  ('zinc-oxide-ore-8', 'کلوخه روی اکسیدی با عیار ۸%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 323),
  ('zinc-oxide-ore-9', 'کلوخه روی اکسیدی با عیار ۹%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 324),
  ('zinc-oxide-ore-10', 'کلوخه روی اکسیدی با عیار ۱۰%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 325),
  ('zinc-oxide-ore-11', 'کلوخه روی اکسیدی با عیار ۱۱%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 326),
  ('zinc-oxide-ore-12', 'کلوخه روی اکسیدی با عیار ۱۲%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 327),
  ('zinc-oxide-ore-13', 'کلوخه روی اکسیدی با عیار ۱۳%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 328),
  ('zinc-oxide-ore-14', 'کلوخه روی اکسیدی با عیار ۱۴%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 329),
  ('zinc-oxide-ore-15', 'کلوخه روی اکسیدی با عیار ۱۵%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 330),
  ('zinc-oxide-ore-16', 'کلوخه روی اکسیدی با عیار ۱۶%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 331),
  ('zinc-oxide-ore-17', 'کلوخه روی اکسیدی با عیار ۱۷%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 332),
  ('zinc-oxide-ore-18', 'کلوخه روی اکسیدی با عیار ۱۸%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 333),
  ('zinc-oxide-ore-19', 'کلوخه روی اکسیدی با عیار ۱۹%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 334),
  ('zinc-oxide-ore-20', 'کلوخه روی اکسیدی با عیار ۲۰%', 'raw', 'کلوخه روی اکسیدی', 'free', false, 335),
  ('zinc-sulfide-ore-5', 'کلوخه روی سولفیدی با عیار ۵%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 336),
  ('zinc-sulfide-ore-6', 'کلوخه روی سولفیدی با عیار ۶%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 337),
  ('zinc-sulfide-ore-7', 'کلوخه روی سولفیدی با عیار ۷%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 338),
  ('zinc-sulfide-ore-8', 'کلوخه روی سولفیدی با عیار ۸%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 339),
  ('zinc-sulfide-ore-9', 'کلوخه روی سولفیدی با عیار ۹%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 340),
  ('zinc-sulfide-ore-10', 'کلوخه روی سولفیدی با عیار ۱۰%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 341),
  ('zinc-sulfide-ore-11', 'کلوخه روی سولفیدی با عیار ۱۱%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 342),
  ('zinc-sulfide-ore-12', 'کلوخه روی سولفیدی با عیار ۱۲%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 343),
  ('zinc-sulfide-ore-13', 'کلوخه روی سولفیدی با عیار ۱۳%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 344),
  ('zinc-sulfide-ore-14', 'کلوخه روی سولفیدی با عیار ۱۴%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 345),
  ('zinc-sulfide-ore-15', 'کلوخه روی سولفیدی با عیار ۱۵%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 346),
  ('zinc-sulfide-ore-16', 'کلوخه روی سولفیدی با عیار ۱۶%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 347),
  ('zinc-sulfide-ore-17', 'کلوخه روی سولفیدی با عیار ۱۷%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 348),
  ('zinc-sulfide-ore-18', 'کلوخه روی سولفیدی با عیار ۱۸%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 349),
  ('zinc-sulfide-ore-19', 'کلوخه روی سولفیدی با عیار ۱۹%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 350),
  ('zinc-sulfide-ore-20', 'کلوخه روی سولفیدی با عیار ۲۰%', 'raw', 'کلوخه روی سولفیدی', 'free', false, 351),
  ('zinc-galv-sheet-0p3-1000', 'ورق گالوانیزه با ضخامت 0.3 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 410),
  ('zinc-galv-sheet-0p4-1000', 'ورق گالوانیزه با ضخامت 0.4 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 411),
  ('zinc-galv-sheet-0p4-1250', 'ورق گالوانیزه با ضخامت 0.4 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 412),
  ('zinc-galv-sheet-0p45-1000', 'ورق گالوانیزه با ضخامت 0.45 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 413),
  ('zinc-galv-sheet-0p45-1250', 'ورق گالوانیزه با ضخامت 0.45 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 414),
  ('zinc-galv-sheet-0p5-1250', 'ورق گالوانیزه با ضخامت 0.5 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 415),
  ('zinc-galv-sheet-0p5-1000', 'ورق گالوانیزه با ضخامت 0.5 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 416),
  ('zinc-galv-sheet-0p55-1000', 'ورق گالوانیزه با ضخامت 0.55 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 417),
  ('zinc-galv-sheet-0p55-1250', 'ورق گالوانیزه با ضخامت 0.55 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 418),
  ('zinc-galv-sheet-0p6-1250', 'ورق گالوانیزه با ضخامت 0.6 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 419),
  ('zinc-galv-sheet-0p6-1000', 'ورق گالوانیزه با ضخامت 0.6 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 420),
  ('zinc-galv-sheet-0p7-1000', 'ورق گالوانیزه با ضخامت 0.7 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 421),
  ('zinc-galv-sheet-0p7-1250', 'ورق گالوانیزه با ضخامت 0.7 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 422),
  ('zinc-galv-sheet-0p8-1250', 'ورق گالوانیزه با ضخامت 0.8 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 423),
  ('zinc-galv-sheet-0p8-1000', 'ورق گالوانیزه با ضخامت 0.8 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 424),
  ('zinc-galv-sheet-0p9-1250', 'ورق گالوانیزه با ضخامت 0.9 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 425),
  ('zinc-galv-sheet-0p9-1000', 'ورق گالوانیزه با ضخامت 0.9 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 426),
  ('zinc-galv-sheet-1-1250', 'ورق گالوانیزه با ضخامت 1 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 427),
  ('zinc-galv-sheet-1-1000', 'ورق گالوانیزه با ضخامت 1 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 428),
  ('zinc-galv-sheet-1p25-1250', 'ورق گالوانیزه با ضخامت 1.25 و عرض 1250 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 429),
  ('zinc-galv-sheet-1p25-1000', 'ورق گالوانیزه با ضخامت 1.25 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 430),
  ('zinc-galv-sheet-1p5-1000', 'ورق گالوانیزه با ضخامت 1.5 و عرض 1000 میلیمتر', 'intermediate', 'ورق گالوانیزه', 'free', false, 431),
  ('zinc-ime-brco-zif1', 'شمش روی 99.96 (تولیدی روی بندرعباس)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 380),
  ('zinc-ime-zrgh-zif1', 'شمش روی 99.96 (ذوب احیای روی قشم)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 381),
  ('zinc-ime-imco-zif1', 'شمش روی 99.96 (فرآوری مواد معدنی ایران)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 382),
  ('zinc-ime-izs-zif1', 'شمش روی 99.96 (ذوب روی اصفهان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 383),
  ('zinc-ime-zrb-zif1', 'شمش روی 99.96 (ذوب روی بافق)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 384),
  ('zinc-ime-caco-zif1', 'شمش روی 99.96 (کالسیمین)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 385),
  ('zinc-ime-imco-zie1', 'شمش روی 99.97 (فرآوری مواد معدنی ایران)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 386),
  ('zinc-ime-srja-zie1', 'شمش روی 99.97 (صنعت روی جهان آرا)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 387),
  ('zinc-ime-sri-zie1', 'شمش روی 99.97 (ملی سرب و روی ایران)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 388),
  ('zinc-ime-snrz-zie1', 'شمش روی 99.97 (صانع روی زنجان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 389),
  ('zinc-ime-izs-zie1', 'شمش روی 99.97 (ذوب روی اصفهان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 390),
  ('zinc-ime-tsk-zii1', 'شمش روی 99.98 (توسعه صنایع روی خاورمیانه)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 391),
  ('zinc-ime-zrec-zii1', 'شمش روی 99.98 (ذوب روی ایجرود)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 392),
  ('zinc-ime-zzki-zii1', 'شمش روی 99.98 (خالص سازان روی زنجان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 393),
  ('zinc-ime-ize-zii1', 'شمش روی 99.98 (گسترش صنایع روی ایرانیان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 394),
  ('zinc-ime-ptz-zii1', 'شمش روی 99.98 (ترکیب پردازان زنجان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 395),
  ('zinc-ime-caco-zic1', 'شمش روی 99.95 (کالسیمین)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 396),
  ('zinc-ime-ptz-zif1', 'شمش روی 99.96 (ترکیب پردازان زنجان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 397),
  ('zinc-ime-sri-zic1', 'شمش روی 99.95 (ملی سرب و روی ایران)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 398),
  ('zinc-ime-rtz-zii1', 'شمش روی 99.98 (روئین طلای زنجان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 399),
  ('zinc-ime-snrz-zib1', 'شمش روی 99.99 (صانع روی زنجان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 400),
  ('zinc-ime-sri-zif1', 'شمش روی 99.96 (ملی سرب و روی ایران)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 401),
  ('zinc-ime-tsk-zie1', 'شمش روی 99.97 (توسعه صنایع روی خاورمیانه)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 402),
  ('zinc-ime-ptz-zie1', 'شمش روی 99.97 (ترکیب پردازان زنجان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 403),
  ('zinc-ime-brco-zie1', 'شمش روی 99.97 (تولیدی روی بندرعباس)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 404),
  ('zinc-ime-ize-zie1', 'شمش روی 99.97 (گسترش صنایع روی ایرانیان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 405),
  ('zinc-ime-srja-zii1', 'شمش روی 99.98 (صنعت روی جهان آرا)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 406),
  ('zinc-ime-zrb-zie1', 'شمش روی 99.97 (ذوب روی بافق)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 407),
  ('zinc-ime-mzc-zie1', 'شمش روی 99.97 (شمش روی میهن)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 408),
  ('zinc-ime-tsk-zif1', 'شمش روی 99.96 (توسعه صنایع روی خاورمیانه)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 409),
  ('zinc-ime-snrz-zii1', 'شمش روی 99.98 (صانع روی زنجان)', 'intermediate', 'شمش روی بورس کالا', 'ime', true, 410)),
p AS (
  INSERT INTO market.products (slug, metal_id, category_id, name_fa, sort, group_id)
  SELECT n.slug, m.id, c.id, n.name_fa, n.sort, g.id
  FROM n
  JOIN market.metals m ON m.slug = 'zinc'
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
WHERE s.product_id = p.id AND p.slug IN ('zinc-oxide-ore-5', 'zinc-oxide-ore-6', 'zinc-oxide-ore-7', 'zinc-oxide-ore-8', 'zinc-oxide-ore-9', 'zinc-oxide-ore-10', 'zinc-oxide-ore-11', 'zinc-oxide-ore-12', 'zinc-oxide-ore-13', 'zinc-oxide-ore-14', 'zinc-oxide-ore-15', 'zinc-oxide-ore-16', 'zinc-oxide-ore-17', 'zinc-oxide-ore-18', 'zinc-oxide-ore-19', 'zinc-oxide-ore-20', 'zinc-sulfide-ore-5', 'zinc-sulfide-ore-6', 'zinc-sulfide-ore-7', 'zinc-sulfide-ore-8', 'zinc-sulfide-ore-9', 'zinc-sulfide-ore-10', 'zinc-sulfide-ore-11', 'zinc-sulfide-ore-12', 'zinc-sulfide-ore-13', 'zinc-sulfide-ore-14', 'zinc-sulfide-ore-15', 'zinc-sulfide-ore-16', 'zinc-sulfide-ore-17', 'zinc-sulfide-ore-18', 'zinc-sulfide-ore-19', 'zinc-sulfide-ore-20', 'zinc-galv-sheet-0p3-1000', 'zinc-galv-sheet-0p4-1000', 'zinc-galv-sheet-0p4-1250', 'zinc-galv-sheet-0p45-1000', 'zinc-galv-sheet-0p45-1250', 'zinc-galv-sheet-0p5-1250', 'zinc-galv-sheet-0p5-1000', 'zinc-galv-sheet-0p55-1000', 'zinc-galv-sheet-0p55-1250', 'zinc-galv-sheet-0p6-1250', 'zinc-galv-sheet-0p6-1000', 'zinc-galv-sheet-0p7-1000', 'zinc-galv-sheet-0p7-1250', 'zinc-galv-sheet-0p8-1250', 'zinc-galv-sheet-0p8-1000', 'zinc-galv-sheet-0p9-1250', 'zinc-galv-sheet-0p9-1000', 'zinc-galv-sheet-1-1250', 'zinc-galv-sheet-1-1000', 'zinc-galv-sheet-1p25-1250', 'zinc-galv-sheet-1p25-1000', 'zinc-galv-sheet-1p5-1000', 'zinc-ime-brco-zif1', 'zinc-ime-zrgh-zif1', 'zinc-ime-imco-zif1', 'zinc-ime-izs-zif1', 'zinc-ime-zrb-zif1', 'zinc-ime-caco-zif1', 'zinc-ime-imco-zie1', 'zinc-ime-srja-zie1', 'zinc-ime-sri-zie1', 'zinc-ime-snrz-zie1', 'zinc-ime-izs-zie1', 'zinc-ime-tsk-zii1', 'zinc-ime-zrec-zii1', 'zinc-ime-zzki-zii1', 'zinc-ime-ize-zii1', 'zinc-ime-ptz-zii1', 'zinc-ime-caco-zic1', 'zinc-ime-ptz-zif1', 'zinc-ime-sri-zic1', 'zinc-ime-rtz-zii1', 'zinc-ime-snrz-zib1', 'zinc-ime-sri-zif1', 'zinc-ime-tsk-zie1', 'zinc-ime-ptz-zie1', 'zinc-ime-brco-zie1', 'zinc-ime-ize-zie1', 'zinc-ime-srja-zii1', 'zinc-ime-zrb-zie1', 'zinc-ime-mzc-zie1', 'zinc-ime-tsk-zif1', 'zinc-ime-snrz-zii1')
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id);
DELETE FROM market.products p
WHERE p.slug IN ('zinc-oxide-ore-5', 'zinc-oxide-ore-6', 'zinc-oxide-ore-7', 'zinc-oxide-ore-8', 'zinc-oxide-ore-9', 'zinc-oxide-ore-10', 'zinc-oxide-ore-11', 'zinc-oxide-ore-12', 'zinc-oxide-ore-13', 'zinc-oxide-ore-14', 'zinc-oxide-ore-15', 'zinc-oxide-ore-16', 'zinc-oxide-ore-17', 'zinc-oxide-ore-18', 'zinc-oxide-ore-19', 'zinc-oxide-ore-20', 'zinc-sulfide-ore-5', 'zinc-sulfide-ore-6', 'zinc-sulfide-ore-7', 'zinc-sulfide-ore-8', 'zinc-sulfide-ore-9', 'zinc-sulfide-ore-10', 'zinc-sulfide-ore-11', 'zinc-sulfide-ore-12', 'zinc-sulfide-ore-13', 'zinc-sulfide-ore-14', 'zinc-sulfide-ore-15', 'zinc-sulfide-ore-16', 'zinc-sulfide-ore-17', 'zinc-sulfide-ore-18', 'zinc-sulfide-ore-19', 'zinc-sulfide-ore-20', 'zinc-galv-sheet-0p3-1000', 'zinc-galv-sheet-0p4-1000', 'zinc-galv-sheet-0p4-1250', 'zinc-galv-sheet-0p45-1000', 'zinc-galv-sheet-0p45-1250', 'zinc-galv-sheet-0p5-1250', 'zinc-galv-sheet-0p5-1000', 'zinc-galv-sheet-0p55-1000', 'zinc-galv-sheet-0p55-1250', 'zinc-galv-sheet-0p6-1250', 'zinc-galv-sheet-0p6-1000', 'zinc-galv-sheet-0p7-1000', 'zinc-galv-sheet-0p7-1250', 'zinc-galv-sheet-0p8-1250', 'zinc-galv-sheet-0p8-1000', 'zinc-galv-sheet-0p9-1250', 'zinc-galv-sheet-0p9-1000', 'zinc-galv-sheet-1-1250', 'zinc-galv-sheet-1-1000', 'zinc-galv-sheet-1p25-1250', 'zinc-galv-sheet-1p25-1000', 'zinc-galv-sheet-1p5-1000', 'zinc-ime-brco-zif1', 'zinc-ime-zrgh-zif1', 'zinc-ime-imco-zif1', 'zinc-ime-izs-zif1', 'zinc-ime-zrb-zif1', 'zinc-ime-caco-zif1', 'zinc-ime-imco-zie1', 'zinc-ime-srja-zie1', 'zinc-ime-sri-zie1', 'zinc-ime-snrz-zie1', 'zinc-ime-izs-zie1', 'zinc-ime-tsk-zii1', 'zinc-ime-zrec-zii1', 'zinc-ime-zzki-zii1', 'zinc-ime-ize-zii1', 'zinc-ime-ptz-zii1', 'zinc-ime-caco-zic1', 'zinc-ime-ptz-zif1', 'zinc-ime-sri-zic1', 'zinc-ime-rtz-zii1', 'zinc-ime-snrz-zib1', 'zinc-ime-sri-zif1', 'zinc-ime-tsk-zie1', 'zinc-ime-ptz-zie1', 'zinc-ime-brco-zie1', 'zinc-ime-ize-zie1', 'zinc-ime-srja-zii1', 'zinc-ime-zrb-zie1', 'zinc-ime-mzc-zie1', 'zinc-ime-tsk-zif1', 'zinc-ime-snrz-zii1')
  AND NOT EXISTS (SELECT 1 FROM market.price_series s WHERE s.product_id = p.id);
DELETE FROM market.product_groups g USING market.metals m
WHERE g.metal_id = m.id AND m.slug = 'zinc' AND g.name_fa IN ('کلوخه روی اکسیدی', 'کلوخه روی سولفیدی', 'ورق گالوانیزه', 'شمش روی بورس کالا')
  AND NOT EXISTS (SELECT 1 FROM market.products p WHERE p.group_id = g.id);
