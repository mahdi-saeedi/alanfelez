# ADR-0005: Keycloak for identity; subscription tiers in the app database

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The lead developer chose Keycloak. The client requires **SMS OTP at sign-up**, and Iranian users expect phone-number login. Staff need roles.

## Decision
Self-host **Keycloak** (own Postgres database). Web uses Auth.js with the Keycloak provider (server-side session, BFF), and admin uses OIDC PKCE. **Go validates access tokens** (go-oidc, JWKS: issuer, audience, expiry) and maps `sub` to a local `users` row. Realm roles are for **staff only** (`admin`, `editor`, `support`). **Tiers are not Keycloak roles.** They live in Postgres (payments and expiry) and are evaluated by `internal/access` (ADR-0010). Phone OTP needs an **SMS authenticator SPI** and a fa/en RTL login theme. Realm config is exported to `services/keycloak/`.

## Consequences
Mature security (sessions, brute force, password policy). One extra service to operate and upgrade. The SMS OTP extension and theme are extra work to budget for.

## Alternatives considered
Custom auth in Go (more security surface for a solo dev), SaaS IdPs (availability from Iran).
