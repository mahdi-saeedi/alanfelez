-- Product groups (client, 2026-11-01): boxes inside a metal's category on the prices page, such as «آلومینیوم نرم» and
-- «آلومینیوم خشک» under aluminium scrap. Staff add, rename, reorder and delete them in the admin; a product belongs to at
-- most one group of its own metal and category (the API checks that). Deleting a group leaves its products ungrouped.

-- +goose Up
CREATE TABLE market.product_groups (
  id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metal_id    smallint NOT NULL REFERENCES market.metals (id),
  category_id smallint NOT NULL REFERENCES market.product_categories (id),
  name_fa     text NOT NULL CHECK (length(name_fa) BETWEEN 1 AND 80),
  name_en     text CHECK (name_en IS NULL OR length(name_en) <= 80),
  sort        int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metal_id, category_id, name_fa)
);
COMMENT ON TABLE market.product_groups IS 'Boxes of products inside one metal and category on the prices page (admin-managed)';

ALTER TABLE market.products ADD COLUMN group_id smallint REFERENCES market.product_groups (id) ON DELETE SET NULL;
COMMENT ON COLUMN market.products.group_id IS 'Optional group of the same metal and category; NULL = shown under «سایر …»';

-- The first two groups, as in the approved mockup (client, 2026-11-01). Nothing happens where the metal or products
-- don't exist yet (a fresh database gets them from the seed after the migrations): staff add groups in the admin.
INSERT INTO market.product_groups (metal_id, category_id, name_fa, name_en, sort)
SELECT m.id, c.id, g.name_fa, g.name_en, g.sort
FROM market.metals m, market.product_categories c,
     (VALUES ('آلومینیوم نرم', 'Soft aluminum', 1), ('آلومینیوم خشک', 'Hard aluminum', 2)) AS g (name_fa, name_en, sort)
WHERE m.slug = 'aluminum' AND c.slug = 'scrap';

UPDATE market.products p SET group_id = g.id
FROM market.product_groups g
WHERE g.name_fa = 'آلومینیوم نرم' AND g.metal_id = p.metal_id AND g.category_id = p.category_id
  AND p.slug IN ('aluminum-soft-scrap', 'aluminum-can', 'aluminum-profile', 'aluminum-soft-turnings');
UPDATE market.products p SET group_id = g.id
FROM market.product_groups g
WHERE g.name_fa = 'آلومینیوم خشک' AND g.metal_id = p.metal_id AND g.category_id = p.category_id
  AND p.slug IN ('aluminum-dry', 'aluminum-ring', 'aluminum-piston', 'aluminum-cylinder-head', 'aluminum-dry-turnings');

-- +goose Down
ALTER TABLE market.products DROP COLUMN group_id;
DROP TABLE market.product_groups;
