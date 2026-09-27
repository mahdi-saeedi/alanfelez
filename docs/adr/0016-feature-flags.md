# ADR-0016: Simple DB-backed feature flags

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
We need to merge unfinished work to trunk (trunk-based development), ship things hidden until the client is ready (English locale, licenses page, chat widget, paid tiers before the gateway is live), and switch features off in an incident.

## Decision
A `feature_flags` table (`key`, `enabled`, `rules jsonb` for simple targeting: staff only, percentage, user list), cached in Redis for 30 s and editable in the admin (audit-logged). Evaluated **server-side in Go** and exposed to UIs through `/v1/me/entitlements`, alongside tier features. Every flag has an owner and a removal issue once it's fully rolled out.

## Consequences
No extra service. Flags are auditable and changeable without deploys. It lacks advanced experimentation, which isn't needed.

## Alternatives considered
Unleash/Flagsmith self-hosted (another service), env-var flags (need redeploys, no runtime kill switch).
