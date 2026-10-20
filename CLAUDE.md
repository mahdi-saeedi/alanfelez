# الان‌فلز (Alan Felez) — Metals Market Information Platform

A bilingual platform (Persian RTL as the default, plus English) for Iran's metals market: live prices, price charts,
expert analysis and forecasts, IME daily auction data, a load-value calculator, and 3-tier subscriptions (Free / Silver / Gold).
The client already runs Iranian servers (ArvanCloud) and owns both domains, alanfelez.ir and alanfelez.com.
**Status:** M1–M6 built. M1 prices/chart, M2 admin + price entry, M3 account + checkout (mock gateway) + renewals/refunds + reminder SMS,
M4 CMS content/FAQ/pages/contact/tickets, M5 IME auctions/calculator/SMS alerts, M6 launch prep (mobile nav, SEO, CSP, rate limits,
load test). Go-live waits for staging on ArvanCloud and client items: see `docs/guides/LAUNCH.md`.
**Stack:** Go API + worker (`services/api`: chi, spec-first OpenAPI, pgx/sqlc/goose, River, SSE) · Next.js public site (`apps/web`) ·
Refine admin (`apps/admin`) · custom Keycloak (`services/keycloak`, `apps/keycloak-theme`) · Postgres · Redis ·
Docker Compose (local) · k3s + Helm + Argo CD/Rollouts (`deploy/`) · GitHub Actions CI.
The owner is one developer; other developers work through Claude. Write code a newcomer can follow.

## How to work in this repo (read this, Claude)
1. **Understand before editing.** Find the closest existing feature and copy its shape: the recipes in `.claude/skills/` name one
   for each common task. Read the area guide first: [`services/api/CLAUDE.md`](services/api/CLAUDE.md),
   [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md), [`apps/admin/CLAUDE.md`](apps/admin/CLAUDE.md), [`deploy/CLAUDE.md`](deploy/CLAUDE.md).
2. **Explain the plan in plain words before a change that touches more than one area** (for example "a new column, an endpoint,
   and a page"), and wait for a yes. The person asking may be new to the codebase: say what you'll change and why, not only how.
3. **Contract first:** API change → `contracts/openapi.yaml` → `task generate` → Go handler → UIs. Never hand-edit generated
   files (`services/api/internal/api/api.gen.go`, `services/api/internal/dbq/*`, `packages/api-client/src/schema.d.ts`).
4. **Prove it works** before saying "done": `task check` (generated code, lint, unit tests, typecheck), plus
   `task test:integration` when handlers or SQL changed, plus the page in the browser pane (fa **and** en, phone width) for UI.
   Report what you ran and what you didn't.
5. **Small steps on a branch.** `feat/<slug>` or `fix/<slug>` from `main`, Conventional Commits, one concern per change.
   **Ship and publish only when the person asks in the chat** (they never need GitHub, ADR-0026): "send it to staging" →
   push to `ship/<slug>`, CI merges it if green and deploys staging (skill `ship-change`); after the stakeholder's OK,
   "publish" → push `publish/production`, which promotes exactly what staging runs (skill `release-to-production`).
   Never push to `main`, never merge PRs yourself. Commit only when asked.
6. **Stop and ask the owner** (don't decide alone) when a change touches: money/billing/payments (`internal/billing`,
   `internal/payment`), the tier matrix (`internal/access`), auth/Keycloak, a migration that changes or drops existing data,
   `deploy/environments/production`, secrets, or anything the client must decide (add it to `docs/product/OPEN_QUESTIONS.md`).
7. **Servers:** local and staging you may inspect and debug. Production is **read-only** (status, logs); every change reaches
   production through git → PR → CI → Argo CD. Never `kubectl apply/edit/delete/exec` or `helm upgrade` by hand. Details: `deploy/CLAUDE.md`.
8. Keep docs true: if you change setup, a convention or the architecture, update the doc (and an ADR for architecture) in the same PR.
9. **Keep `docs/TODO.md` current** (skill `update-todo`): in the same change, move finished jobs to Done and add anything
   new you found. Asked "what's next?" → answer from it.

## Commands (all in `Taskfile.yml`; `task --list`)
| | |
|---|---|
| `task up` / `task down` / `task ps` / `task logs -- api` | Local stack in Docker Compose (web :3000, admin :5173, API :8080, Keycloak :8081) |
| `task api:reload` · `task web:reload` · `task admin:reload` | Rebuild one app on the host and restart its container (fast loop) |
| `task generate` | Regenerate Go server, sqlc queries and the TS client after editing `openapi.yaml` or `queries/*.sql` |
| `task check` | Everything fast that CI checks: generated code up to date, Go lint + unit tests, TS typecheck, Helm lint |
| `task test:integration` | Handler tests against real Postgres (needs `task up`) |
| `task otp` | Local OTP codes for signing in. Local test users and staff: `docs/guides/LOCAL_SETUP.md` (users table) |
| `task smoke` · `task seed` · `task loadtest` · `task k8s:*` | Smoke test · re-seed · k6 load test · local Kubernetes |

## Read these when the task needs them
| Doc | What |
|---|---|
| [`docs/product/SCOPE.md`](docs/product/SCOPE.md) | **The primary spec.** Confirmed v1 scope, feature matrix, and all 🛠 dev decisions |
| [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) | Tech stack, repo layout, main flows, caching, conventions |
| [`docs/architecture/adr/`](docs/architecture/adr/) | One file per architecture decision (why things are the way they are) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow, commits, **Definition of Done**, code conventions |
| `docs/architecture/` `NFR.md` `DATA_MODEL.md` `API_GUIDELINES.md` `SECURITY.md` | Engineering baselines. Follow them when writing code |
| `docs/guides/` `LOCAL_SETUP.md` `TESTING.md` `DEPLOYMENT.md` `OPERATIONS.md` `LAUNCH.md` | How to run, test, deploy, operate, launch |
| [`docs/product/OPEN_QUESTIONS.md`](docs/product/OPEN_QUESTIONS.md) | Client answers (round 1) and open follow-ups F1–F17 |
| [`docs/content/`](docs/content/) | Client-provided copy (`faq.fa.txt`, `about.fa.txt`, `terms.fa.txt`). Source of truth for text |
| [`docs/design/screenshots/summary-draft/`](docs/design/screenshots/summary-draft/) | Newest design screenshots (15, named by page) |
| [`ONBOARDING.md`](ONBOARDING.md) | For a new developer: setup, and how to work with Claude here |

Source-of-truth order: **client Word files (content/features) > SCOPE.md > Figma design (look & feel) > older spec docs**.
When sources conflict or something is unspecified, don't guess. Add it to `docs/product/OPEN_QUESTIONS.md` as a follow-up.

## Hard rules
- **Brand name is «الان‌فلز» / "Alan Felez"**, not «آلان‌فلز». The design and prototype still use the old spelling, so replace it.
- **Removed from v1:** marketplace / «اعلام بار» / listings / seller contact, the verified badge, trading groups, Matching,
  the Enterprise tier, the API. If the design or the Word files show them, leave them out anyway (SCOPE §4).
- Visual style follows the Figma design: layout, components, colors (tokens in `apps/web/CLAUDE.md`), Vazirmatn font.
- Client copy is used **verbatim**. Don't rewrite Persian copy from the Word files. UI strings live in i18n message files,
  CMS content in localized DB fields via the Go API. Never hard-code user-facing text in components.
- **Copy rule:** never «قیمت قطعی», «تضمین سود», «پیش‌بینی قطعی بازار» or similar. Prices and analyses are information and estimates.
  Always show the source and the "last updated" time next to prices.
- **i18n from day one:** `fa` (RTL, Jalali, Persian digits) is the default and `en` (LTR, Gregorian) lives at `/en`. Use logical CSS properties only
  (`ms-*`, `me-*`, `start`, `end`), never `left`/`right`.
- **Access control:** tier/feature checks go through `services/api/internal/access` only (Go), and they're config-driven. UIs read `/v1/me/entitlements`. Locked data is **never sent to
  the browser**. The 🔒 UI is presentation only.
- **Money** is integer Rial (`bigint`), shown in Toman. **Dates** are stored as UTC `timestamptz`. No floats for money.
- **Self-host assets** (fonts, icons). No Google Fonts or foreign CDNs at runtime, since users are in Iran.
- **Staff writes are audited** (`audit.Write` in the same transaction) and checked by role (`requireRoles`).
- **No secrets in git.** Local test credentials only come from repo files (seed, `.env.example`).
- **Git:** Conventional Commits (`feat(prices): …`, scopes in CONTRIBUTING §3). Commit only when the user asks.
