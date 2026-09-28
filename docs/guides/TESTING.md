# Testing Strategy

> Status: **Proposed**. Coverage targets: NFR MNT-1. Everything below runs in CI (ADR-0013) unless it's marked *manual*.

## 1. Test pyramid
| Level | Scope | Tools | Where | Runs |
|---|---|---|---|---|
| **Unit** | Pure logic: access matrix, calculator, proration, unit/currency conversion, Jalali and market-day helpers, outlier gate | `go test` (table tests), Vitest (UI utils) | next to the code (`*_test.go`, `*.test.ts`) | every PR |
| **Integration** | Handlers + real Postgres/Redis: SQL (sqlc), migrations, transactions, River jobs, SSE hub | `go test -tags integration` against a throwaway database per test (`TEST_DATABASE_URL`: the compose Postgres locally, a service container in CI; `task test:integration`) | `services/api/internal/**` with `//go:build integration`, helper `internal/testdb` | every PR |
| **Contract** | API matches `openapi.yaml`, and there are no unintended breaking changes | oapi-codegen strict server + kin-openapi response validation in tests, **oasdiff** vs `main` | CI job | every PR |
| **Component** | Shared UI components in both directions (RTL/LTR), locked/unlocked states | Vitest + Testing Library, Storybook (optional, phase 2) | `packages/ui` | every PR |
| **E2E** | Critical user journeys in a real browser against a compose stack | **Playwright** (fa + en projects, mobile + desktop viewports) + **axe** | `e2e/` | PR (smoke) and nightly (full) |
| **Visual** | Screenshot comparison of key pages in fa/en | Playwright `toHaveScreenshot` | `e2e/visual` | nightly + before release |
| **Load** | SSE connections, price pages, chart API | **k6** | `load/` | before launch and before major releases (*manual trigger*) |
| **Security** | Baseline DAST | OWASP ZAP baseline | CI (manual trigger) | before release |

## 2. What must be tested (non-negotiable)
- **`internal/access`:** a table test over **every tier × every feature**, generated from the matrix. It fails if a feature lacks an explicit expectation.
- **Paid-data leakage:** for every endpoint with a `Feature` gate, an integration test asserts that anonymous, Free and Silver users get **no protected fields** in the JSON.
- **`internal/calculator`:** golden vectors in `testdata/*.json` (inputs → expected Rial result), including rounding, zero or edge percentages, ton↔kg, USD × rate, and both shipping modes.
- **Billing:** order/payment state machine (every transition), idempotent callback (verify called twice → one subscription), proration, expiry, the refund eligibility rule.
- **Market data:** ingestion idempotency (same batch twice → no duplicates), outlier quarantine, `prev_close` over holidays and weekends, stale detection that respects market hours.
- **Migrations:** `up` on an empty DB, `up` from the previous release's schema with seed data. Each migration must be reversible or documented as irreversible.

## 3. Critical E2E journeys (Playwright)
1. Visitor opens Home (fa) → live price updates arrive over SSE → switches to English → the layout flips to LTR.
2. Visitor opens Metal Prices → filters by metal and category → sees locked rows as Free → the CTA leads to Plans.
3. Sign-up with mobile + OTP (SMS provider mocked in test mode) → profile created → Free tier.
4. Buy Gold (gateway sandbox/mock) → callback → Gold active → the calculator and analysis unlock → the invoice shows in the account.
5. Upgrade Silver → Gold with proration.
6. FAQ: search → open a question → copy the deep link → reload → the same question is open and scrolled into view.
7. Staff: log in to the admin with 2FA → enter a manual price → it appears on the site within 2 s → the audit log entry exists.
8. Contact form → the message shows in the admin. Ticket create → staff reply → the user sees the reply.

Every journey runs in **fa and en** and at **360 px and 1440 px**. Each one includes an axe check (no serious or critical violations).

## 4. Test data
- **Seed** (`task seed`): the prototype's sample metals, products and prices + 90 days of generated history, sample articles and FAQ (from `docs/content/`), plus test users per tier.
- **Factories** in Go test helpers for users, subscriptions, series and points. No shared mutable fixtures between tests.
- External providers (SMS, payment, price sources) use **fake adapters** in tests, selected by config. Recorded real responses live in `testdata/` for the adapter tests.

## 5. Conventions
- Test names describe behavior: `TestCan_SilverCannotReadForecast`, `it('shows locked state for free users')`.
- No sleeping in tests. Poll with timeouts, and use River's test helpers.
- Flaky test = bug: quarantine it with an issue link within 24 h, then fix it.
- Coverage is reported in CI. **The gate is on critical packages** (≥ 90 %), not a global number.
