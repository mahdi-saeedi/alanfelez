# ADR-0007: PostgreSQL with pgx + sqlc + goose; Redis for cache and pub/sub

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
Business, content and high-volume price history need a reliable relational store with range queries (charts from 1D to MAX). A solo developer needs data access that's explicit and easy to review.

## Decision
**PostgreSQL 16**, accessed with **pgx**. Queries are written in SQL and compiled to type-safe Go with **sqlc**. Schema changes are **goose** SQL migrations only, run by `cmd/migrate` during deploy. Migrations must be backward compatible (expand → migrate → contract) so rollbacks stay safe. Price history uses plain tables with `(product_id, observed_at)` indexes, and the **TimescaleDB** extension is added only if measurements require it. **Redis 7** holds the latest-price cache, pub/sub, rate limits and OTP throttling.

## Consequences
SQL is visible and reviewable, there's no ORM magic, and query errors are caught at generate time. More SQL to write by hand than with an ORM.

## Alternatives considered
GORM/ent (heavier abstractions), a separate time-series DB (more ops).
