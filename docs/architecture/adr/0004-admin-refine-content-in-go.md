# ADR-0004: Admin panel: Refine SPA on the Go API; content stored by Go (no separate CMS)

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The client wants *everything* editable (content, FAQ, pages, plans, manual prices, users, support, settings). Payload CMS was considered, but it runs only on Node.js, and with a Go backend it would mean two backends and two sources of truth.

## Decision
Content (news, analyses, forecasts, FAQ, pages, site settings) lives in Postgres behind the Go API, with localized fields (fa/en) and rich text edited in TipTap (stored as sanitized HTML, see ADR-0025). The admin panel is **Refine** (React, Vite) in `apps/admin`, using the generated API client, Keycloak PKCE auth and role-based menus. A TipTap editor for rich text and presigned uploads to Arvan Object Storage for media.

## Consequences
One backend, one database schema, one auth model. Content types need a small amount of backend code each (sqlc + handlers), which a CMS would give for free. Refine gives CRUD tables, forms, filters and i18n out of the box.

## Alternatives considered
Payload CMS next to Go (two backends), Directus/Strapi (another Node service + data split), a fully custom admin (slow).
