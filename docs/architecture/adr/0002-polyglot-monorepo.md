# ADR-0002: Polyglot monorepo: Go backend, TypeScript frontends

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The lead developer chose **Go** for the backend. The public site needs SSR/SEO (React/Next.js), and the admin panel is a React SPA. One developer maintains everything, and it must be easy to hand over.

## Decision
One git repo: `services/api` (a single Go module, one binary `cmd/alanfelez` with `serve`/`migrate`/`seed`/`bootstrap` subcommands), `services/keycloak` (custom Keycloak image), `apps/web` (Next.js), `apps/admin` (Refine), `packages/*` (ui, generated api-client, config), `contracts/openapi.yaml` (contract), `config/seed` (initial data), `deploy/` (local compose files, Helm, Argo CD). **pnpm workspaces** for the TS side (Turborepo can be added if builds get slow), Go modules for Go, and a root **Taskfile** that orchestrates both (`task up`, `task test`, `task generate`, `task lint`).

## Consequences
Atomic changes across API and UI in one PR. One CI pipeline. Two ecosystems to keep up to date (Renovate handles both).

## Alternatives considered
Separate repos per app (sync overhead for one person), a TypeScript-only backend (rejected: lead dev prefers Go).
