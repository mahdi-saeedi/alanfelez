-- +goose Up
-- The raw-materials category is called «مواد اولیه معدنی» (client, 2026-11-04). A label only; the seed carries the
-- same name for new databases.
UPDATE market.product_categories SET name_fa = 'مواد اولیه معدنی', name_en = 'Mineral raw materials' WHERE slug = 'raw';

-- +goose Down
UPDATE market.product_categories SET name_fa = 'مواد اولیه', name_en = 'Raw materials' WHERE slug = 'raw';
