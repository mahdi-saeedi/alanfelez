-- name: ListMetals :many
SELECT slug, name_fa, name_en FROM market.metals ORDER BY sort, slug;

-- name: ListCategories :many
SELECT slug, name_fa, name_en FROM market.product_categories ORDER BY sort, slug;

-- name: ListMarkets :many
SELECT slug, name_fa, name_en, scope FROM market.markets ORDER BY sort, slug;

-- name: ListActivePlans :many
SELECT code, name_fa, name_en, rank FROM app.plans WHERE active ORDER BY rank;

-- name: ListCurrentPlanPrices :many
SELECT plan_code, period, amount_rial
FROM app.plan_prices
WHERE valid_to IS NULL AND valid_from <= now()
ORDER BY plan_code, CASE period WHEN 'month' THEN 1 WHEN 'quarter' THEN 2 ELSE 3 END;
