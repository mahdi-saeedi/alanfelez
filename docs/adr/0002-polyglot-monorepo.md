# ADR-0002: Polyglot monorepo: Go backend, TypeScript frontends

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The lead developer chose **Go** for the backend. The public site needs SSR/SEO (React/Next.js), and the admin panel is a React SPA. One developer maintains everything, and it must be easy to hand over.

## Decision
One git repo: `services/api` (a single Go module with `cmd/api`, `cmd/worker`, `cmd/migrate`), `apps/web` (Next.js), `apps/admin` (Refine), `packages/*` (ui, generated api-client, config), `api/openapi.yaml` (contract), `infra/`. **pnpm workspaces + Turborepo** for the TS side, Go modules for Go, and a root **Taskfile** that orchestrates both (`task dev`, `task test`, `task generate`, `task lint`).

## Consequences
Atomic changes across API and UI in one PR. One CI pipeline. Two ecosystems to keep up to date (Renovate handles both).

## Alternatives considered
Separate repos per app (sync overhead for one person), a TypeScript-only backend (rejected: lead dev prefers Go).
