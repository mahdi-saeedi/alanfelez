# ADR-0010: Config-driven tier access control owned by Go, exposed as entitlements

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
Many features are locked by tier (🔒), and the matrix may still change (F2). CSS-only blurring leaks paid data. Duplicating the matrix in TypeScript would drift.

## Decision
`internal/access` defines `Feature` keys and a per-tier config matrix (plus limits such as chart history days). Every handler calls `access.Can(ctx, feature)`, and locked features return a **teaser payload only**. `GET /v1/me/entitlements` gives the web and admin UIs the evaluated feature map for rendering `<Locked>`. **The matrix exists only in Go.** A table test covers all tier × feature combinations.

## Consequences
Changing the tier table is one Go config change + tests. New features must register a `Feature` key.

## Alternatives considered
Ad-hoc tier checks (scattered), a duplicated TS matrix (drift), Keycloak roles for tiers (billing sync issues).
