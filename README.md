# الان‌فلز — Alan Felez

A bilingual (Persian / English) information platform for Iran's metals market. It covers live prices, price charts, expert analysis
and forecasts, Iran Mercantile Exchange (IME) daily auction data, a load-value calculator, and Free / Silver / Gold subscriptions.

> **Project status (2026-09-28):** discovery done, client round-1 answers received, stack **accepted**.
> No application code yet. See [Roadmap](#roadmap).

## Start here (new developer)

Read these in order:
1. **[docs/SCOPE.md](docs/SCOPE.md)**: what we're building in v1 and what was removed. It's the primary spec.
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**: tech stack, repo layout, how live prices, auth, access control and payments work.
3. **[docs/adr/](docs/adr/)**: why each technical decision was made.
4. **[docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)**: client answers and what's still waiting on the client.
5. **[CLAUDE.md](CLAUDE.md)**: hard rules, design tokens and conventions (also used as AI-assistant context).
6. **[CONTRIBUTING.md](CONTRIBUTING.md)**: toolchain, branching, commits, PRs, **Definition of Done**.

Reference docs:

| Doc | Topic |
|---|---|
| [docs/NFR.md](docs/NFR.md) | Performance, availability, freshness, recovery, a11y, SEO targets |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Schemas, ER diagrams, money/units/time rules, retention |
| [docs/API_GUIDELINES.md](docs/API_GUIDELINES.md) | REST conventions, errors (RFC 9457), pagination, idempotency, versioning, SSE |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, OTP abuse, paid-data protection, price integrity, release checklist |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Observability, alerts, runbooks, backups & DR, incidents |
| [docs/TESTING.md](docs/TESTING.md) | Test pyramid, must-test list, E2E journeys |
| [docs/PROCESS.md](docs/PROCESS.md) | Scope baseline, milestones/UAT, change requests |
| [docs/RISKS.md](docs/RISKS.md) | Risk register |

## Repository map

| Path | Contents |
|---|---|
| `docs/SCOPE.md` | v1 product scope, feature matrix per tier, dev decisions (🛠) |
| `docs/ARCHITECTURE.md`, `docs/adr/` | Architecture and decision records |
| `docs/OPEN_QUESTIONS.md` | Client Q&A log and follow-ups |
| `docs/content/` | Client-provided copy (FAQ, About, Terms). **Use verbatim** |
| `docs/screenshots/` | Design screenshots. `summary-draft/` is the newest, named by page |
| `docs/brand/` | Logo (low-res, vector pending) |
| `docs/client/` | Question documents sent to and answered by the client |
| `docs/source-text/` | Plain-text copies of the client's original spec documents |
| `docs/archive/` | Superseded working docs |
| `.github/` | PR template, issue templates (feature, bug, change request), CODEOWNERS. Workflows will be added in M1 |
| `*.docx` (repo root) | Original client documents as received. Don't edit them |
| `api/`, `services/api/`, `apps/`, `packages/`, `infra/`, `.github/workflows/` | *(to be created)*. See ARCHITECTURE §3 |

Design reference (Figma Make prototype): https://ratio-donkey-94517275.figma.site/. This is an older build; see OPEN_QUESTIONS F1.

## Tech stack

**Backend:** Go (chi, spec-first OpenAPI via oapi-codegen, pgx + sqlc + goose, River jobs, SSE hub) · PostgreSQL · Redis · Keycloak (OIDC, SMS OTP).
**Frontends:** Next.js App Router public site (fa/en, next-intl) · Refine admin SPA · Tailwind v4 · generated TS API client.
**Platform:** Docker Compose on ArvanCloud · Arvan Container Registry · Caddy · GitHub Actions CI/CD (staging auto-deploy, production on tag with approval). Details and reasons are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting started

*Not available yet.* Once scaffolded, this will document the prerequisites (Docker + mise; mise installs the pinned Go, Node, pnpm and Task), `task dev`
(compose: Postgres, Redis, Keycloak + api/worker + web/admin), `task generate`, seeding, and env vars (`.env.example`).

## Conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …). Small PRs. CI (lint, typecheck, test, build) must pass.
- Contract first: change `api/openapi.yaml`, run `task generate`, commit the generated code.
- Go: golangci-lint clean, domain packages under `internal/`, sqlc for queries, goose for migrations (backward compatible).
- TypeScript strict on web/admin. Money is integer Rial. Store dates as UTC and display them in Jalali/Gregorian per locale.
- Logical CSS only (RTL/LTR). No hard-coded user-facing text. Client copy stays verbatim.
- Every architecture change gets an ADR.

## Roadmap

| Phase | Content | Status |
|---|---|---|
| 0 | Discovery, client Q&A, scope, architecture | ✅ done |
| 1 | Scaffold monorepo (Go + TS), OpenAPI contract, CI/CD pipeline + staging, local compose, design system (tokens, fonts, RTL/LTR, shared components), i18n, Keycloak realm | 🚧 in progress |
| 2 | Market data: schema, admin manual entry, ingestion adapters, SSE. Pages: Home, Metal Prices, Price Chart | |
| 3 | Auth (OTP sign-up), account, subscriptions + payments, access control | |
| 4 | CMS content: Forecast & Analysis, FAQ, About, Terms, Privacy, Licenses, Contact + tickets | |
| 5 | Gold features: calculator, IME daily auctions, SMS price alerts | |
| 6 | Mobile polish, SEO, performance, security review, staging review with client → production launch | |
