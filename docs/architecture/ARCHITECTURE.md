# Architecture & Tech Stack

> **Status: ACCEPTED (rev. 2: Go backend + CI/CD), approved by the lead developer on 2026-09-28.**
> Scope assumptions: [`SCOPE.md`](../product/SCOPE.md). Each decision has an ADR in [`adr/`](adr/).
> Related: [NFR](NFR.md) · [Data model](DATA_MODEL.md) · [API guidelines](API_GUIDELINES.md) · [Security](SECURITY.md) · [Operations](../guides/OPERATIONS.md) · [Testing](../guides/TESTING.md) · [Risks](../product/RISKS.md)
> Proposed ADRs may be revised until accepted. After that, a change means a new ADR that supersedes the old one.

## 1. Constraints that shaped this design

| Constraint | Consequence |
|---|---|
| **One developer**, and the project has to be easy to hand over | One backend and one API contract (OpenAPI). Generated clients instead of hand-written glue |
| Lead dev chose **Go for the backend** | All business logic, data, jobs and live streaming live in Go. The TypeScript apps are pure UI clients |
| **SEO matters** (price pages, FAQ deep links and schema, news) and the site is **bilingual fa/en** | Next.js for the public site, server-rendered, calling the Go API |
| **Admin panel: everything editable** (client answer #10) | A React admin SPA on the same Go API. Content (news, FAQ, pages) is stored by Go too, so there's one source of truth |
| **Keycloak** for auth, **SMS OTP at sign-up** | OIDC everywhere. Go validates JWTs. Keycloak needs an SMS authenticator extension |
| Hosted on **ArvanCloud**, used from Iran | Docker images built in CI abroad, pushed to **Arvan Container Registry**, pulled on the server (Docker Hub blocks Iranian IPs). Self-host fonts and assets |
| Price APIs may fail or not exist yet | Adapter per source + **admin manual entry fallback** (client answer #8) |
| Tier matrix may still change (F2) | Config-driven access control, owned by Go and exposed to the UIs as entitlements |

## 2. The stack

### Backend (Go)
| Concern | Choice | Why |
|---|---|---|
| Language | **Go** (latest stable, 1.25+) | Lead dev's choice. Fast, simple deployment (one static binary), great for SSE and many concurrent connections |
| HTTP | **net/http + chi** router | Idiomatic, stdlib-compatible middleware |
| API contract | **OpenAPI 3.1, spec-first** (`contracts/openapi.yaml`) → **oapi-codegen** (Go server interfaces + types) and **openapi-typescript / openapi-fetch** (TS client) | One contract. Go and TS can't drift apart, and CI fails if generated code is stale |
| Database | **PostgreSQL 16** via **pgx** | |
| Queries | **sqlc** (type-safe Go generated from SQL) | Plain SQL, compile-time safety, no ORM magic. Easy for the next developer to read |
| Migrations | **goose** (SQL migrations in `services/api/migrations/`) | Versioned, run as a one-off step on deploy |
| Cache / pub-sub | **Redis 7** via go-redis | Latest prices, SSE fan-out, rate limiting, OTP throttling |
| Background jobs | **River** (Postgres-backed job queue for Go) | Transactional enqueue (a job commits with the data), retries, scheduling, a UI. No extra infra |
| Auth | **Keycloak** (OIDC). Go validates access tokens with **go-oidc** / JWKS | Standard, stateless API auth |
| Validation | OpenAPI request validation (kin-openapi middleware) + domain validation in Go | |
| Config | env vars parsed into a typed struct (**caarlos0/env**), validated at startup | 12-factor |
| Logging | **log/slog** (JSON), request IDs | stdlib |
| Rich text | Stored as TipTap JSON + sanitized HTML (**bluemonday**) | Safe rendering, editable in the admin |
| Files | **ArvanCloud Object Storage** (S3 API) via presigned uploads (aws-sdk-go-v2) | Images for news and analysis |
| Testing | `go test -race`, **testcontainers-go** (real Postgres/Redis), table tests | The access matrix and calculator get exhaustive tests |
| Lint / security | **golangci-lint**, **govulncheck** | Run in CI |

### Frontends (TypeScript)
| Concern | Choice | Why |
|---|---|---|
| Public site | **Next.js (App Router, RSC)** in `apps/web`, frontend only | SSR/ISR for SEO. Calls the Go API server-side. The prototype is React + Tailwind v4 |
| Admin panel | **Refine** (React, Vite SPA) in `apps/admin` | Built for admin panels: CRUD, tables, filters, forms, auth, i18n, access control. Adapter for our REST API. RTL-capable |
| Styling | **Tailwind CSS v4** + the prototype's CSS variables. **Radix UI** primitives (shadcn-style local components) | Shared design system for web and admin |
| i18n | **next-intl** (web, `fa` at `/`, `en` at `/en`). Refine i18n provider (admin, fa/en) | Bilingual from day one. Logical CSS only |
| Auth (web) | **Auth.js** with the Keycloak provider. The Next.js server holds the session and forwards the access token to Go (BFF) | Tokens stay out of browser JS |
| Auth (admin) | OIDC Authorization Code + PKCE (**oidc-client-ts**) against Keycloak | Standard SPA flow, staff roles |
| Charts | **TradingView lightweight-charts** + an SVG sparkline component | Financial series, small bundle |
| Dates / numbers | **date-fns-jalali**, `Intl.NumberFormat` | Jalali + Persian digits (fa), Gregorian (en) |
| Forms | react-hook-form + Zod (types generated from OpenAPI where possible) | |
| Testing | **Vitest**, **Playwright** (e2e + fa/en screenshots) | |
| Tooling | **pnpm workspaces** + Taskfile, golangci-lint, TypeScript strict | |

### Platform
| Concern | Choice |
|---|---|
| Containers | One Docker image each: `api` (Go, distroless, also runs the worker via a subcommand), `web`, `admin` (static, served by Caddy) |
| Runtime | Local: **Docker Compose** (`compose.yaml`). Staging/production: **Kubernetes (k3s) on ArvanCloud**, Helm chart, **Arvan CDN** in front (ADR-0019) |
| Delivery | **Argo CD** GitOps + **Argo Rollouts** canary with automatic rollback (ADR-0020, [DEPLOYMENT.md](../guides/DEPLOYMENT.md)) |
| Auth server | Custom **Keycloak** image: phone-OTP authenticator + pluggable SMS SPI + Keycloakify theme (ADR-0022) |
| Registry | **ArvanCloud Container Registry** |
| CI/CD | **GitHub Actions** (see §6). The deploy step goes over SSH, or a self-hosted runner on the Arvan server |
| Observability | OpenTelemetry → **Prometheus / Grafana / Loki / Tempo** + **GlitchTip** errors + Uptime Kuma (ADR-0015, [OPERATIONS.md](../guides/OPERATIONS.md)) |
| Feature flags | DB-backed, admin-editable, evaluated in Go (ADR-0016) |
| Analytics | Self-hosted **Umami**, cookieless, + web-vitals RUM (ADR-0017) |
| Tooling | **mise** (pinned Go/Node/pnpm/Task), **Taskfile**, **lefthook**, Renovate, release-please (ADR-0018, [CONTRIBUTING.md](../../CONTRIBUTING.md)) |

## 3. Repository layout (polyglot monorepo)

Top level = one folder per concern. ✅ = exists today, ⏳ = planned.

```
alanfelez/
├─ apps/                         User-facing TypeScript apps
│  ├─ keycloak-theme/        ✅  Login theme (Keycloakify + React + Tailwind), builds a theme jar
│  ├─ web/                   ✅  Next.js public site (fa/en, SSR, Auth.js → Keycloak)
│  └─ admin/                 ✅  Refine admin SPA (staff-only, OIDC PKCE, runtime config)
├─ services/                     Backend services (each builds one Docker image)
│  ├─ api/                   ✅  Go module, single binary `alanfelez` (serve | migrate | seed | bootstrap)
│  │  ├─ cmd/alanfelez/          entrypoint and subcommands
│  │  ├─ internal/
│  │  │  ├─ access/              tier/feature matrix, entitlements
│  │  │  ├─ calculator/          pure load-value logic (+ golden test vectors)
│  │  │  ├─ seed/                idempotent initial-data loader
│  │  │  ├─ api/                 HTTP handlers (+ generated api.gen.go)
│  │  │  ├─ dbq/                 generated sqlc queries
│  │  │  ├─ platform/            config, db, httpx (router, problems, health), logx
│  │  │  └─ market/ billing/ content/ support/ users/ integrations/   ⏳ by milestone
│  │  ├─ migrations/             goose SQL (embedded in the binary)
│  │  ├─ queries/                sqlc SQL
│  │  └─ Dockerfile
│  └─ keycloak/              ✅  Custom Keycloak image
│     ├─ extensions/             Java SPI: phone OTP authenticator + pluggable SmsSender
│     ├─ realm/                  production-safe realm (clients, roles, flows, no users)
│     └─ Dockerfile
├─ packages/                 ✅  Shared TS: ui (tokens, Vazirmatn, formatters), api-client (generated from the contract)
├─ contracts/
│  └─ openapi.yaml           ✅  THE API contract. Edit first, then `task generate`
├─ config/
│  └─ seed/                  ✅  Initial data per profile (reference = all envs, demo = local/staging)
├─ deploy/
│  ├─ local/                 ✅  compose-only files, k8s.sh (local k3d + Gitea + Argo CD), smoke.sh
│  ├─ helm/                  ✅  alanfelez-data (CNPG Postgres, Redis) + alanfelez (bootstrap, keycloak, api, web, admin)
│  ├─ environments/          ✅  values per environment: local, staging, production (image tags bumped by CI = GitOps)
│  ├─ argocd/                ✅  install values, AppProject, root app + child apps per environment (app-of-apps)
│  └─ observability/         ⏳  Grafana dashboards, alert rules
├─ docs/                         See docs/README.md
├─ .github/                  ✅  CI, Release (images → GitOps bump), Rollback workflows; PR/issue templates
├─ compose.yaml              ✅  Local stack: `docker compose up --build` / `task up`
├─ Taskfile.yml              ✅  Every developer command (`task --list`)
├─ mise.toml                 ✅  Pinned toolchain
└─ package.json, pnpm-workspace.yaml   TypeScript workspace root
```

## 4. How the main flows work

### 4.1 Live prices
```
price sources ─► worker (River: one periodic prices.fetch job per source, internal/jobs)
admin manual ──┐ │ adapter (internal/prices/source/<provider>) → quotes
entry (API)    ▼ ▼
        internal/prices.Ingest — one transaction per batch:
          validate → outlier gate (max_jump_bp) → INSERT market.price_points (idempotent)
          → UPSERT market.price_latest (+ prev_close for daily change) → audit row for manual entries
                 └► after commit: PUBLISH prices:updates (Redis)
                                  │
browser ◄─ SSE  GET /v1/prices/stream  (internal/prices/live: one Redis subscription per API pod, fanned out;
                                        each stream starts with a snapshot from price_latest, filtered by tier)
browser ◄─ server-rendered snapshot from Next.js (calls GET /v1/prices), so SEO and first paint work without JS
```
- Every point stores its source, `observed_at` and `is_manual`; the series defines `unit` and `currency`. The UI always shows the source and "last updated" (manual points show the market as their source).
- Automated points that jump more than the series threshold are **quarantined** until staff approve them; manual entries above it need an explicit confirmation (SECURITY §6).
- Postgres (`price_latest`) is the source of truth for current prices. Redis only carries the pub/sub fan-out, so a Redis outage delays live updates but never loses data.
- **Fallback:** each source has a staleness threshold. The admin dashboard flags stale sources, and staff enter prices manually (form or CSV).
- Caddy streams the SSE route without buffering (`flush_interval -1`).

### 4.2 Auth & authorization
- **Keycloak** owns identities: mobile + **SMS OTP sign-up** (required), OTP or password login, reset, sessions, brute-force protection.
  ⚠️ This needs an SMS authenticator SPI (community phone provider or a small custom one) and a fa/en RTL theme. Budget time for it.
- **Web:** Auth.js (Keycloak provider) on the Next.js server. Server components call Go with the user's access token (BFF). Anonymous calls are allowed for public data.
- **Admin:** PKCE flow. Go requires the realm roles `admin` / `editor` / `support` on `/v1/admin/*`.
- **Go** validates the JWT (issuer, audience, expiry, JWKS; `internal/auth`). An invalid token is a 401, never an anonymous request. The tier comes from `app.subscriptions` by `sub` (`internal/subscription`); a local `users` table comes with accounts/billing.
- **Subscription tier isn't a Keycloak role.** It lives in Postgres (`subscriptions`) and is evaluated by `internal/access`.

### 4.3 Access control (the 🔒 system)
- `internal/access` holds `Feature` keys (`prices.full`, `chart.history.full`, `analysis.read`, `forecast.read`, `auctions.read`,
  `calculator.use`, `alerts.sms`) and a **config matrix** per tier (plus limits such as `chart.history.days`).
- Every handler checks `access.Can(ctx, feature)`. For locked features it returns a **teaser payload**, never the real data.
- `GET /v1/me/entitlements` gives the UIs the feature map, so `<Locked>` renders from the same source. **There's no duplicate matrix in TS.**
- A table test covers every tier × feature combination.

### 4.4 Payments
- `PaymentGateway` interface: `Create` → redirect → `Verify` on callback. Idempotent by order ID. The subscription period is created
  in the same DB transaction as the payment verification. Upgrades are prorated. Amounts are `bigint` Rial and shown in Toman.

### 4.5 Calculator
- The authoritative logic is in Go (`internal/calculator`). The web UI calls `POST /v1/calculator/estimate` (debounced) for Gold users.
- Golden test vectors (`calculator/testdata/*.json`) document the formula and are reused if a TS preview is ever added.

## 4.6 Caching
| Layer | What | TTL / invalidation |
|---|---|---|
| Arvan CDN | Static assets (hashed) | 1 year, immutable |
| Arvan CDN | Public HTML (Home, Prices, Chart, FAQ, content) | `s-maxage=30–300` + `stale-while-revalidate`. Only anonymous responses are cached, and requests with a session cookie bypass the cache |
| Next.js | Server `fetch` to the Go API | Tag-based revalidation: the Go API calls a Next.js revalidate webhook on content publish. Prices use short `revalidate` (30 s), because live values come over SSE |
| Go API | Public read endpoints | Redis response cache 30–300 s. Keys include locale + tier. Price keys are purged on ingest |
| Redis | Latest prices | Overwritten on ingest (no TTL). Postgres `price_latest` is the fallback |
| Browser | API responses | `Cache-Control` per endpoint (API_GUIDELINES §7). Personalized = `private, no-store` |

Rule: **never cache personalized or tier-gated responses in a shared cache.** The CDN only sees anonymous content.

## 5. Conventions (maintainability)
- **Contract first:** API changes start in `contracts/openapi.yaml`, then `task generate`. CI fails if generated code isn't committed.
- Go: package by domain under `internal/`. Handlers stay thin, logic lives in services, data access is via sqlc. Errors wrap `%w`, and domain errors map to RFC 9457 problem JSON.
  Pass `context.Context` everywhere. No global state except the config loaded in `main`.
- **Money:** `bigint` Rial. **Dates:** `timestamptz` UTC, converted to Jalali or Gregorian only in the UI.
- **i18n:** localized DB fields as `*_fa` / `*_en` columns (or a JSONB `{fa, en}`), and message files on the frontend. No hard-coded user-facing text.
- **Client copy verbatim** (`docs/content/`). Logical CSS only (RTL/LTR).
- Conventional Commits, small PRs, CI green before merge, and an ADR for every architecture change.

## 6. CI/CD (ADR-0013 for CI, ADR-0020 for delivery)

```
PR opened/updated ──► CI (GitHub Actions)
  ├─ go:        golangci-lint · go test -race · govulncheck · sqlc/oapi generate + diff check
  ├─ keycloak:  mvn test (OTP authenticator, SMS SPI) · image build
  ├─ web/admin/theme: eslint · tsc · vitest · build · generated api-client diff check
  ├─ contract:  openapi lint · breaking-change check vs main (oasdiff)
  ├─ deploy:    helm lint + kubeconform on every environment's values
  ├─ e2e:       compose up → Playwright smoke (fa + en)
  └─ security:  gitleaks · Trivy (deps + images)
merge to main ──► build images (tag = git SHA) → Arvan Container Registry
              ──► commit tag bump to deploy/environments/staging → Argo CD syncs staging (PreSync bootstrap → canary)
tag vX.Y.Z   ──► PR bumping deploy/environments/production → review/merge = approval → Argo CD syncs production
rollback     ──► automatic (canary analysis) | "Rollback" workflow / git revert of the bump commit
```
Step-by-step procedures: **[DEPLOYMENT.md](../guides/DEPLOYMENT.md)**. Dependency updates: Renovate. Releases and changelog: release-please.

## 7. Environments
| Env | Where | Notes |
|---|---|---|
| local | `task up` (Docker Compose: Postgres, Redis, Keycloak, bootstrap, api) | Seed profiles `reference,demo`, OTP via console. [LOCAL_SETUP.md](../guides/LOCAL_SETUP.md) |
| staging | k3s on ArvanCloud, auto-deployed from `main` by Argo CD | Client review. Gateway sandbox. Seed `reference,demo` |
| production | k3s on ArvanCloud, deployed from release tags | Seed `reference` only. CloudNativePG WAL archiving + nightly backups |

## 8. Decisions still open (see `docs/product/OPEN_QUESTIONS.md`)
These don't change the stack:
- Final tier/feature matrix (F2) → `internal/access` config only
- Price APIs/providers (F5) → which `pricesource` adapters get written (manual entry works regardless)
- SMS provider (F7) → `sms` adapter + Keycloak SMS authenticator config
- Payment gateway (the client is obtaining it) → `payment` adapter
- Git host: GitHub is assumed. If you prefer GitLab, only the CI syntax changes
