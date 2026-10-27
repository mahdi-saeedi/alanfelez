# Launch runbook (M6)

How to take الان‌فلز from staging to production, and what has to be true first. Tick every box in a PR that updates this
file (the PR is the record). Environments and delivery: [DEPLOYMENT.md](DEPLOYMENT.md). Operations: [OPERATIONS.md](OPERATIONS.md).

## 1. Blocked on the client (docs/product/OPEN_QUESTIONS.md)

| | Item | Why it blocks launch |
|---|---|---|
| ☐ | **F13 payment gateway** (merchant id, sandbox, then production keys) | No sales without it. Until then production runs with `paymentGateway: none` (checkout says "unavailable") |
| ☐ | **F7 SMS provider** (account, sender number, templates approved by the operator) | Sign-up needs OTP; reminders and price alerts need SMS. Production refuses the console provider |
| ☐ | **F11 scope sign-off** and the milestone UATs (PROCESS §2) | Contract |
| ☐ | **F8 legal review** of Terms, Privacy and the refund rules | Legal |
| ☐ | **F14 content edits** confirmed, **F4 English** reviewed | Copy is the client's; `locale.en` stays off until F4 |
| ☐ | **F3 vector logo**, **F5 price sources**, **F16 IME data**, **F12 product list** | Quality of launch content (manual entry works meanwhile) |
| ☐ | Contact details and social links entered (admin → Site settings), eNamad (done 2026-10-24: id 8262525 in admin → Site settings; eNamad verifies it once it is on alanfelez.ir) | The site hides empty ones, so this doesn't block, but should be done |

## 2. Infrastructure (ArvanCloud)

| | Item | Notes |
|---|---|---|
| ☐ | Staging cluster and registry exist; staging deployed and smoke-tested | DEPLOYMENT §3 |
| ☐ | Production cluster (k3s) sized per NFR SCL-3 | 2 web pods handle ~440 concurrent visitors; the HPA scales to 6 (§4) |
| ☐ | DNS: `alanfelez.ir`, `api.`, `auth.`, `admin.` → Arvan CDN; `alanfelez.com` → 301 to `.ir` | SCOPE §2 |
| ☐ | TLS on every host (Arvan edge + cluster ingress), HTTP → HTTPS | HSTS is sent automatically when the site URL is https |
| ☐ | `api.trustedProxies` includes the **Arvan CDN edge ranges** | Otherwise every visitor shares one IP for rate limits (DEPLOYMENT §6) |
| ☐ | CDN: cache `/_next/static/*` long; **don't cache HTML** (pages carry a per-request CSP nonce and may be personal) | §4 explains the capacity without HTML caching |
| ☐ | Backups: WAL archiving + nightly base backup to Object Storage; **one restore drill done** | NFR DR-1..4, OPERATIONS §5 |
| ☐ | Object Storage bucket + `alanfelez-backup-s3` secret, then `postgres.backup.enabled: true` again on staging | Staging runs **without backups** until then (data-values.yaml) |
| ☐ | Monitoring and alerts live (uptime, 5xx rate, p95, SSE connections, source staleness, SMS spend) | NFR, OPERATIONS |
| ☐ | Secrets sealed for production (AUTH_SECRET, Keycloak client secrets, DB, gateway, SMS) | No secret in git |

## 3. Configuration to check on production

| | Setting | Value |
|---|---|---|
| ☐ | `web.indexable` | `true` (only here: staging must stay `noindex`) |
| ☐ | `web.cspFormOrigins` | the gateway's payment page origin (F13) |
| ☐ | `api.paymentGateway` / `api.smsProvider` / `keycloak.otp.smsProvider` | the real providers (F13, F7) |
| ☐ | `api.seedProfiles` | `reference` only (demo data is refused in production anyway) |
| ☐ | Demo content already loaded (test mode) | Delete the «(نمونه)» articles (admin → «مقالات») and auctions (admin → «مزایدات»), which show on the home page too, and any test prices, auctions and users; switching the seed profile doesn't remove them |
| ☐ | Feature flags: admin → «قابلیت‌ها» (payments only switch on once the real gateway is configured) | `payments.enabled` on after a real test payment; `locale.en` on after F4; `page.licenses` on when licences exist |
| ☐ | Keycloak realm: password policy `length(10) and notUsername and notEmail`, brute-force protection on | New realms get it from the realm file; **existing realms: set it once in the console** |
| ☐ | Staff accounts created with the right roles; every staff member has TOTP set up | SECURITY T5 |
| ☐ | SMS budget (`sms.daily_budget_rial`) set to what the client accepts | Alerts and reminders pause at the budget |

## 4. Load test (k6, `task loadtest`, script `deploy/loadtest/public.js`)

Local run on 2026-09-29 (one laptop, Docker Desktop with 4 CPUs shared by every container; **one** website process and
one API process). Visitors browse pages with 2–6 s think time; the API gets a steady stream of reads at the same time.

| Concurrent visitors | API rate | API p95 / p99 | Page p95 | Errors | Verdict |
|---|---|---|---|---|---|
| 50 | 50 req/s | 4.7 / 7.6 ms | 59 ms | 0 % | ✅ |
| 150 | 150 req/s | 4.8 ms | 172 ms | 0 % | ✅ |
| 220 | 220 req/s | 4.8 ms | 419 ms | 0 % | ✅ (≈ 55 pages/s) |
| 300 | 300 req/s | 6.2 / 23 ms | **1.47 s** | 0 % | ❌ page budget (800 ms) |

Findings:
- The **API is nowhere near its limit** (PERF-2: p95 ≤ 200 ms) at the launch peak.
- **Page rendering is CPU-bound**: one website process serves ~55 pages/s (~220 concurrent visitors) inside the budget.
  Production therefore runs **2–6 web pods with CPU autoscaling** (`web.autoscaling`, 500m CPU requested per pod), which
  covers the launch peak (300) with room and the 12-month estimate (2,000) at the top of the range.
- A pod used ~480 MiB at full load, so the memory limit is now 768 MiB (was 512 MiB: it would have been OOM-killed).
- Not done yet, and worth doing on staging: the same test against the real cluster (`PEAK=300`, then `PEAK=2000`),
  and an SSE soak test (thousands of open streams) — k6 has no built-in SSE client, use a small script or `curl` loop.

## 5. Security review (M6)

Checked against [SECURITY.md](../architecture/SECURITY.md) and the NFR:

| Area | Status |
|---|---|
| Locked data never sent (T2, T7) | ✅ Integration tests for prices, charts, articles, auctions, calculator, alerts (FEATURE_LOCKED / teasers) |
| Access control per role and owner (T7) | ✅ Tests for staff roles on every admin write; other users' orders, tickets, calculations, alerts → 404 |
| XSS (T6) | ✅ Rich text sanitized on write (ADR-0025); **CSP with per-request nonces** on the website (`'strict-dynamic'`, no inline scripts without the nonce, `object-src 'none'`, `frame-ancestors 'none'`); admin CSP `script-src 'self'` |
| Headers | ✅ HSTS (https), nosniff, Referrer-Policy, X-Frame-Options, COOP, Permissions-Policy; `noindex` outside production and always on the admin |
| Scraping / abuse (T2, §4) | ✅ **API rate limit**: 300 req/min per user, 120 req/min per IP for anonymous callers (staff and the website server exempt); contact form 5/h + 20/day per IP + honeypot; SMS caps and daily budget |
| Payments (T4) | ✅ Server-to-server verify, idempotency, amount check (M3 tests). Reconciliation job waits for the real gateway (F13) |
| Auth (T1, T5) | ✅ OTP limits in Keycloak, brute-force protection, refresh-token rotation, 5-min access tokens, staff TOTP; password policy added (§3) |
| Secrets and dependencies (SEC-7) | ✅ CI: gitleaks, govulncheck, Trivy on images and dependencies |
| Audit (SEC-5) | ✅ Every staff write, including content, settings, support and IME entries |
| Open | ☐ A penetration test by someone other than the developer before launch (recommended); ☐ the concurrent-session limit for paid tiers (SECURITY §5) isn't built yet |

## 6. Go-live day

1. Freeze: no merges to `main` except launch fixes. Announce the window to the client (outside market hours, Sat–Wed 09:00–13:00 Tehran).
2. Tag the release (`release-please` PR) → CI builds and pushes images → merge the production values PR (image tags).
3. Argo CD syncs production; the bootstrap job migrates and seeds `reference`; the canary rolls out (DEPLOYMENT §1).
4. Smoke: `deploy/local/smoke.sh https://api.alanfelez.ir https://alanfelez.ir https://auth.alanfelez.ir`, then by hand:
   sign up with OTP, buy the cheapest plan with a real card (and refund it), check an SMS alert, the admin login with TOTP.
5. Turn on `payments.enabled`. Submit `https://alanfelez.ir/sitemap.xml` in the search consoles.
6. Watch dashboards for 2 hours (5xx, p95, SSE, SMS spend). Rollback = DEPLOYMENT §5 (one step, GitOps revert).
