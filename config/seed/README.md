# Seed data (initial data)

Loaded by `alanfelez seed` / `alanfelez bootstrap` (ADR-0021). The loader is in `services/api/internal/seed`.

| Profile | Used in | Content |
|---|---|---|
| `reference/` | **every** environment | Data the app needs to work: metals, categories, markets, plans and prices, feature flags, default site settings |
| `demo/` | local, staging (**refused in production**) | Sample data for development and client demos |

Select profiles with `SEED_PROFILES` (default `reference`, compose uses `reference,demo`).

## Rules
- Files are applied in name order (`10-…`, `20-…`). One file = one transaction.
- `mode: insert_missing` (default) only inserts rows whose natural key is new. **It never overwrites edits made in the admin panel.**
  Use this for anything staff can edit (plans, prices, settings, flags).
- `mode: upsert` makes the DB match the file. Only use it for data that is owned by code, never edited in the admin.
- To **add** initial data later, just add rows or files. The next deploy inserts them. To **change** data that already exists in
  production, use the admin panel (audited) or a migration, not an `insert_missing` seed.
- Unchanged files (same checksum) are skipped. `alanfelez seed --force` re-applies them.
- Money is in **Rial** (Toman × 10). Only tables and columns registered in `seed.Datasets` are accepted.
