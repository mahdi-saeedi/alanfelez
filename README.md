# الان‌فلز — Alan Felez

A bilingual (Persian / English) information platform for Iran's metals market. It covers live prices, price charts, expert analysis
and forecasts, Iran Mercantile Exchange (IME) daily auction data, a load-value calculator, and Free / Silver / Gold subscriptions.

> **Project status (2026-09-28):** M1 (foundation), M2 (market data) and M3 (accounts & payments) complete, pending the client's review.
> Everything runs locally with one command: website, admin panel, Go API + worker, and Keycloak with phone OTP + Keycloakify theme.
> Prices come from a demo generator until the real price APIs arrive (F5); staff can enter them by hand (single or CSV).
> The Kubernetes delivery pipeline (Argo CD, canary, automatic and manual rollback) is tested on a local cluster.
> Checkout runs end to end with a mock gateway until the client's gateway arrives (F13).
> Next: M4 CMS content (analysis, FAQ, pages, contact & tickets). See [Roadmap](#roadmap).

## Start here (new developer)

Read these in order:
1. **[docs/product/SCOPE.md](docs/product/SCOPE.md)**: what we're building in v1 and what was removed. It's the primary spec.
2. **[docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)**: tech stack, repo layout, how live prices, auth, access control and payments work.
3. **[docs/architecture/adr/](docs/architecture/adr/)**: why each technical decision was made.
4. **[docs/product/OPEN_QUESTIONS.md](docs/product/OPEN_QUESTIONS.md)**: client answers and what's still waiting on the client.
5. **[CLAUDE.md](CLAUDE.md)**: hard rules, design tokens and conventions (also used as AI-assistant context).
6. **[CONTRIBUTING.md](CONTRIBUTING.md)**: toolchain, branching, commits, PRs, **Definition of Done**.

Reference docs:

| Doc | Topic |
|---|---|
| [docs/architecture/NFR.md](docs/architecture/NFR.md) | Performance, availability, freshness, recovery, a11y, SEO targets |
| [docs/architecture/DATA_MODEL.md](docs/architecture/DATA_MODEL.md) | Schemas, ER diagrams, money/units/time rules, retention |
| [docs/architecture/API_GUIDELINES.md](docs/architecture/API_GUIDELINES.md) | REST conventions, errors (RFC 9457), pagination, idempotency, versioning, SSE |
| [docs/architecture/SECURITY.md](docs/architecture/SECURITY.md) | Threat model, OTP abuse, paid-data protection, price integrity, release checklist |
| [docs/guides/OPERATIONS.md](docs/guides/OPERATIONS.md) | Observability, alerts, runbooks, backups & DR, incidents |
| [docs/guides/TESTING.md](docs/guides/TESTING.md) | Test pyramid, must-test list, E2E journeys |
| [docs/product/PROCESS.md](docs/product/PROCESS.md) | Scope baseline, milestones/UAT, change requests |
| [docs/product/RISKS.md](docs/product/RISKS.md) | Risk register |

## Repository map

| Path | Contents |
|---|---|
| `apps/` | User-facing TypeScript apps: `keycloak-theme/` (Keycloakify) now, then `web/` and `admin/` |
| `services/api/` | Go backend: one binary (`serve`, `migrate`, `seed`, `bootstrap`), migrations, queries |
| `services/keycloak/` | Custom Keycloak image: phone-OTP authenticator + SMS SPI (`extensions/`), login theme, realm |
| `contracts/openapi.yaml` | The API contract (edit first, then `task generate`) |
| `config/seed/` | Initial data per profile (`reference` = every environment, `demo` = local/staging) |
| `deploy/` | Deployment: `local/` (compose-only files) now, then `helm/`, `environments/`, `argocd/` |
| `docs/` | Everything written down. Start at [docs/README.md](docs/README.md) |
| `.github/` | PR template, issue templates, CODEOWNERS (workflows come with CI/CD) |
| `compose.yaml`, `Taskfile.yml`, `mise.toml` | Local stack, developer commands, pinned toolchain |

Design reference (Figma Make prototype): https://ratio-donkey-94517275.figma.site/. This is an older build; see OPEN_QUESTIONS F1.

## Tech stack

**Backend:** Go (chi, spec-first OpenAPI via oapi-codegen, pgx + sqlc + goose, River jobs, SSE hub) · PostgreSQL · Redis · Keycloak (OIDC, SMS OTP).
**Frontends:** Next.js App Router public site (fa/en, next-intl) · Refine admin SPA · Tailwind v4 · generated TS API client.
**Platform:** Docker Compose (local) · Kubernetes (k3s) on ArvanCloud for staging/production · Helm · **Argo CD** (GitOps) + Argo Rollouts (canary, automatic rollback) · GitHub Actions CI · Arvan Container Registry. Details and reasons are in [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

## Getting started

```bash
task setup   # once: installs the pinned toolchain (mise) and git hooks
task up      # builds and starts everything, runs migrations and seed data
```

Then open http://localhost:3000 (website), http://localhost:5173 (admin panel) and http://localhost:8080/v1/metals (API).
Sign in with any mobile number; `task otp` shows the code. `task smoke` checks everything. Full instructions for **macOS, Linux and Windows**, including slow or restricted networks:
**[docs/guides/LOCAL_SETUP.md](docs/guides/LOCAL_SETUP.md)**. Staging/production: **[docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md)**.

## Conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …). Small PRs. CI (lint, typecheck, test, build) must pass.
- Contract first: change `contracts/openapi.yaml`, run `task generate`, commit the generated code.
- Go: golangci-lint clean, domain packages under `internal/`, sqlc for queries, goose for migrations (backward compatible).
- TypeScript strict on web/admin. Money is integer Rial. Store dates as UTC and display them in Jalali/Gregorian per locale.
- Logical CSS only (RTL/LTR). No hard-coded user-facing text. Client copy stays verbatim.
- Every architecture change gets an ADR.

## Roadmap

| Phase | Content | Status |
|---|---|---|
| 0 | Discovery, client Q&A, scope, architecture | ✅ done |
| 1 | Monorepo, OpenAPI contract, Go API foundation, seed/bootstrap, Keycloak (phone OTP, SMS SPI, Keycloakify theme, staff TOTP), web + admin shells (fa/en), design tokens, Docker Compose, Helm + Argo CD + Rollouts (tested locally), CI/Release/Rollback workflows | ✅ done (staging cluster setup pending: DEPLOYMENT §3) |
| 2 | Market data: schema, ingestion (River worker, adapter registry, demo source, outlier quarantine), history API, SSE, tier-gated prices, admin manual/CSV entry + review queue + source health + manual plan grants. Pages: Home, Metal Prices, Price Chart | ✅ done (real price APIs pending F5; chart compare and unit conversion to Toman for LME later) |
| 3 | Account page, checkout (quote → gateway → server-side verify), queued renewals, prorated upgrades, refunds, renewal SMS, admin users/orders/refunds | ✅ done (real gateway pending F13, SMS provider F7) |
| 4 | CMS content: Forecast & Analysis, FAQ, About, Terms, Privacy, Licenses, Contact + tickets | |
| 5 | Gold features: calculator, IME daily auctions, SMS price alerts | |
| 6 | Mobile polish, SEO, performance, security review, staging review with client → production launch | |
