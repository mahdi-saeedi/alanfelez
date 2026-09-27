# Architecture & Tech Stack

> **Status: ACCEPTED (rev. 2: Go backend + CI/CD), approved by the lead developer on 2026-09-28.**
> Scope assumptions: [`SCOPE.md`](SCOPE.md). Each decision has an ADR in [`adr/`](adr/).
> Related: [NFR](NFR.md) · [Data model](DATA_MODEL.md) · [API guidelines](API_GUIDELINES.md) · [Security](SECURITY.md) · [Operations](OPERATIONS.md) · [Testing](TESTING.md) · [Risks](RISKS.md)
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
| API contract | **OpenAPI 3.1, spec-first** (`api/openapi.yaml`) → **oapi-codegen** (Go server interfaces + types) and **openapi-typescript / openapi-fetch** (TS client) | One contract. Go and TS can't drift apart, and CI fails if generated code is stale |
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
| Tooling | **pnpm workspaces + Turborepo**, ESLint, Prettier | |

### Platform
| Concern | Choice |
|---|---|
| Containers | One Docker image each: `api` (Go, distroless, also runs the worker via a subcommand), `web`, `admin` (static, served by Caddy) |
| Runtime | **Docker Compose** on ArvanCloud cloud servers. **Caddy** reverse proxy (TLS, SSE-friendly). **Arvan CDN** in front |
| Registry | **ArvanCloud Container Registry** |
| CI/CD | **GitHub Actions** (see §6). The deploy step goes over SSH, or a self-hosted runner on the Arvan server |
| Observability | OpenTelemetry → **Prometheus / Grafana / Loki / Tempo** + **GlitchTip** errors + Uptime Kuma (ADR-0015, [OPERATIONS.md](OPERATIONS.md)) |
| Feature flags | DB-backed, admin-editable, evaluated in Go (ADR-0016) |
| Analytics | Self-hosted **Umami**, cookieless, + web-vitals RUM (ADR-0017) |
| Tooling | **mise** (pinned Go/Node/pnpm/Task), **Taskfile**, **lefthook**, Renovate, release-please (ADR-0018, [CONTRIBUTING.md](../CONTRIBUTING.md)) |

## 3. Repository layout (polyglot monorepo)

```
alanfelez/
├─ api/
│  └─ openapi.yaml              ← THE contract. Edit this first, then `task generate`
├─ services/
│  └─ api/                      Go module
│     ├─ cmd/api/               HTTP server (REST + SSE)
│     ├─ cmd/worker/            River workers: ingestion, IME auctions, alerts/SMS, reminders
│     ├─ cmd/migrate/           goose runner (used by deploy)
│     ├─ internal/
│     │  ├─ market/             metals, products, sources, prices, history, SSE hub
│     │  ├─ auctions/           IME daily auctions
│     │  ├─ calculator/         pure load-value logic (+ golden test vectors)
│     │  ├─ access/             tier/feature matrix, entitlements
│     │  ├─ billing/            plans, subscriptions, payments, refunds
│     │  ├─ content/            news, analyses, forecasts, FAQ, pages (localized)
│     │  ├─ support/            contact messages, tickets
│     │  ├─ users/              profile (identity itself lives in Keycloak), alert settings
│     │  ├─ integrations/       payment/, sms/, pricesource/, auctionsource/ adapters
│     │  └─ platform/           db, redis, httpx (middleware, errors), auth (OIDC), config, storage, log
│     ├─ migrations/            goose SQL
│     ├─ queries/               sqlc SQL files
│     └─ sqlc.yaml
├─ apps/
│  ├─ web/                      Next.js public site (fa/en)
│  └─ admin/                    Refine admin SPA
├─ packages/
│  ├─ ui/                       design tokens + shared React components
│  ├─ api-client/               generated TS client from openapi.yaml (never hand-edited)
│  └─ config/                   tsconfig / eslint / prettier presets
├─ infra/
│  ├─ compose/                  docker-compose.dev.yml, docker-compose.prod.yml
│  ├─ caddy/                    Caddyfile
│  └─ keycloak/                 realm export, themes (fa/en, RTL), SMS authenticator
├─ .github/workflows/           ci.yml, deploy.yml
├─ Taskfile.yml
└─ docs/
```

## 4. How the main flows work

### 4.1 Live prices
```
price sources ─► worker (River periodic job per source)
                 │ normalize → validate → upsert market.prices + append market.price_history (one transaction)
                 │ SET price:latest:<productId> (Redis)
                 └► PUBLISH prices:updates (Redis)
                                  │
browser ◄─ SSE  GET /v1/prices/stream  (Go SSE hub subscribes to Redis, fans out to clients)
browser ◄─ server-rendered snapshot from Next.js (calls GET /v1/prices), so SEO and first paint work without JS
```
- Every price row stores `source`, `unit`, `currency`, `observed_at` and `is_manual`. The UI always shows the source and "last updated".
- **Fallback:** each source has a staleness threshold. The admin dashboard flags stale sources, and staff enter prices manually (form or CSV).
- Caddy streams the SSE route without buffering (`flush_interval -1`).

### 4.2 Auth & authorization
- **Keycloak** owns identities: mobile + **SMS OTP sign-up** (required), OTP or password login, reset, sessions, brute-force protection.
  ⚠️ This needs an SMS authenticator SPI (community phone provider or a small custom one) and a fa/en RTL theme. Budget time for it.
- **Web:** Auth.js (Keycloak provider) on the Next.js server. Server components call Go with the user's access token (BFF). Anonymous calls are allowed for public data.
- **Admin:** PKCE flow. Go requires the realm roles `admin` / `editor` / `support` on `/v1/admin/*`.
- **Go** validates the JWT (issuer, audience, expiry, JWKS) and maps `sub` → a local `users` row, created on first request.
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
- **Contract first:** API changes start in `api/openapi.yaml`, then `task generate`. CI fails if generated code isn't committed.
- Go: package by domain under `internal/`. Handlers stay thin, logic lives in services, data access is via sqlc. Errors wrap `%w`, and domain errors map to RFC 9457 problem JSON.
  Pass `context.Context` everywhere. No global state except the config loaded in `main`.
- **Money:** `bigint` Rial. **Dates:** `timestamptz` UTC, converted to Jalali or Gregorian only in the UI.
- **i18n:** localized DB fields as `*_fa` / `*_en` columns (or a JSONB `{fa, en}`), and message files on the frontend. No hard-coded user-facing text.
- **Client copy verbatim** (`docs/content/`). Logical CSS only (RTL/LTR).
- Conventional Commits, small PRs, CI green before merge, and an ADR for every architecture change.

## 6. CI/CD (see ADR-0013)

```
PR opened/updated ──► CI (GitHub Actions)
  ├─ go:    golangci-lint · go test -race (testcontainers) · govulncheck · sqlc/oapi generate + diff check
  ├─ web/admin: eslint · tsc · vitest · build · generated api-client diff check
  ├─ contract: openapi lint (Redocly/Spectral) · breaking-change check vs main (oasdiff)
  ├─ e2e:   compose up (api+web+postgres+redis+keycloak) → Playwright smoke (fa + en)
  └─ security: gitleaks (secrets) · Trivy (image + deps)
merge to main ──► build images (tag = git SHA) → push to Arvan Container Registry
              ──► deploy STAGING automatically: run migrations → docker compose pull && up → health checks → smoke tests
tag vX.Y.Z   ──► deploy PRODUCTION (GitHub Environment, manual approval): DB backup → migrations → rolling restart → health checks
rollback     ──► re-deploy the previous image tag (migrations must be backward compatible: expand → migrate → contract)
```
- Dependency updates: **Renovate**. Releases and changelog: **release-please** (from Conventional Commits).
- Secrets live in GitHub Environments (staging/production) and are written to the server `.env` at deploy time. Never in git.
- Branch protection on `main`: PR + green CI required.

## 7. Environments
| Env | Where | Notes |
|---|---|---|
| local | `task dev`: compose (Postgres, Redis, Keycloak) + `go run` api/worker + `pnpm dev` web/admin | Seed data = the prototype's sample prices |
| staging | ArvanCloud small server, auto-deployed from `main` | Client review. Gateway sandbox. SMS in test mode |
| production | ArvanCloud server(s), deployed from tags | Nightly `pg_dump` to Arvan Object Storage. Keycloak DB backed up too |

## 8. Decisions still open (see `docs/OPEN_QUESTIONS.md`)
These don't change the stack:
- Final tier/feature matrix (F2) → `internal/access` config only
- Price APIs/providers (F5) → which `pricesource` adapters get written (manual entry works regardless)
- SMS provider (F7) → `sms` adapter + Keycloak SMS authenticator config
- Payment gateway (the client is obtaining it) → `payment` adapter
- Git host: GitHub is assumed. If you prefer GitLab, only the CI syntax changes
