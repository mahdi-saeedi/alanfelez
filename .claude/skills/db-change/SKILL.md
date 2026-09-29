---
name: db-change
description: Change the Postgres schema or queries (goose migration, sqlc query, seed data). Use when adding a table or column, an index, a query, or initial/reference data.
---

# Database change

Conventions: `docs/architecture/DATA_MODEL.md` §3 and `services/api/CLAUDE.md` (Database). Example migration:
`services/api/migrations/00005_gold.sql`. Example queries: `services/api/queries/gold.sql`.

## Migration
1. New file `services/api/migrations/0000N_<what>.sql` (next number). **Never edit a migration that has been merged**: staging
   and production already ran it.
2. `-- +goose Up` … `-- +goose Down` (Down undoes Up exactly). Comment what each table is for.
3. Types: money `bigint` Rial with `CHECK (x >= 0)`, weights `bigint` kg, time `timestamptz`, ids `uuid PRIMARY KEY DEFAULT gen_random_uuid()`,
   `created_at/updated_at timestamptz NOT NULL DEFAULT now()`. Schemas `market` (market data) or `app` (users, plans, content…).
   Foreign keys and `UNIQUE` for natural keys. An index for every query filter you add.
4. **Backward compatible (expand/contract):** the old code must keep working against the new schema during a canary.
   Add columns nullable or with a default. Renaming or dropping = two releases (add new → switch code → drop later).
   **Stop and ask the owner** before a migration that changes or deletes existing rows.

## Queries
5. Add to `services/api/queries/<area>.sql`:
   ```sql
   -- name: ListThings :many
   SELECT t.id, t.name FROM app.things t WHERE t.user_id = $1 ORDER BY t.created_at DESC LIMIT 50;
   ```
   `:one` / `:many` / `:exec` / `:execrows` (for "did it delete/update anything?"). Alias tables in UPDATE/JOIN.
   Optional filters: `sqlc.narg(metal)::text`. Owner scoping in the `WHERE` (`AND user_id = $2`).
6. `task generate`, then use `s.q.ListThings(ctx, …)` in the handler.

## Seed data (`config/seed/`, rules in `config/seed/README.md`)
- Data every environment needs (a new plan, category, flag, setting) → `config/seed/reference/NN-*.yaml`, `mode: insert_missing`.
- Sample data for local/staging → `config/seed/demo/`. Relative dates use the `Ago` columns (see `demo/30-ime.yaml`).
- A new table must be registered in `seed.Datasets` (`services/api/internal/seed`) before a seed file can write to it.
- Seeds never overwrite admin edits. To change data that already exists in production, write a migration.

## Check
`task check`, `task test:integration` (runs every migration on an empty DB), then `task api:reload` (the bootstrap container
migrates and seeds the local DB) and `task logs -- bootstrap` to see it applied. Update `DATA_MODEL.md` if the model changed.
