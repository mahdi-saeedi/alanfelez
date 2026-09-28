# ADR-0021: Environments start from scratch: bootstrap job and config-driven seed data

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
Any environment (a laptop, a new staging cluster, disaster recovery) must come up from an empty database with no manual SQL. Some data must exist for the app to work (metals, markets, plans, prices, feature flags, settings), and staff will edit part of it later in the admin panel.

## Decision
The API binary has a `bootstrap` subcommand = `migrate` (goose, embedded, session-locked) + `seed`. Seed data lives in versioned YAML under `config/seed/<profile>/` (baked into the image): `reference` for every environment, and `demo` for local/staging only (refused when `APP_ENV=production`). The loader only writes to tables and columns whitelisted in `seed.Datasets`. It supports `insert_missing` (default: never overwrites admin edits) and `upsert` (code-owned data), records file checksums in `app.seed_runs` so unchanged files are skipped, and holds an advisory lock. It runs as a one-shot compose service locally and as an Argo CD PreSync hook Job in Kubernetes. The API starts only after it succeeds.

## Consequences
One command brings up a complete environment. New initial data ships with the code that needs it, and re-running is always safe. Changing already-live data has to go through the admin panel or a migration, which is intentional.

## Alternatives considered
SQL seed scripts (not idempotent, easy to overwrite edits), data created manually after deploy (not reproducible).
