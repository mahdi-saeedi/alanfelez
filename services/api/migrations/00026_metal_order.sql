-- The seven metals in the client's order (2026-11-02): آلومینیوم، مس، روی، سرب، برنج، چدن، آهن. Menus, filters and
-- tables follow metals.sort.

-- +goose Up
UPDATE market.metals m SET sort = v.sort
FROM (VALUES ('aluminum', 1), ('copper', 2), ('zinc', 3), ('lead', 4), ('brass', 5), ('cast-iron', 6), ('iron', 7)) AS v (slug, sort)
WHERE m.slug = v.slug;

-- +goose Down
UPDATE market.metals m SET sort = v.sort
FROM (VALUES ('aluminum', 1), ('copper', 2), ('brass', 3), ('zinc', 4), ('lead', 5), ('iron', 6), ('cast-iron', 7)) AS v (slug, sort)
WHERE m.slug = v.slug;
