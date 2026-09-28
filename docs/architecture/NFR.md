# Non-Functional Requirements (NFR)

> Status: **Proposed**. Numbers marked ❓ are assumptions until the client confirms the traffic figures (OPEN_QUESTIONS **F10**).
> Each requirement has an ID so tests, dashboards and alerts can refer to it.

## 1. Capacity assumptions ❓ (drive sizing and load tests)

| Metric | Launch | 12 months | Notes |
|---|---|---|---|
| Registered users | 2,000 | 20,000 | ❓ F10 |
| Daily active users | 500 | 5,000 | ❓ |
| Peak concurrent visitors | 300 | 2,000 | Market open hours, Sat–Wed 09:00–13:00 Tehran |
| Peak concurrent SSE connections | 300 | 2,000 | One per open tab. Design target: **10,000** per api instance |
| Page views / day | 10k | 100k | |
| Tracked products (price series) | 200 | 500 | «۲۰۰+ نوع داده» |
| Price points / day | ~20k | ~100k | 200–500 series × minute-to-hourly updates |
| Price history rows / year | ~10M | ~40M | Fine for plain Postgres with good indexes (ADR-0007) |

## 2. Performance

| ID | Requirement | How it's measured |
|---|---|---|
| PERF-1 | **LCP ≤ 2.5 s**, INP ≤ 200 ms, CLS ≤ 0.1 on the 75th percentile (mobile, Iranian 4G) for Home, Prices, Chart and FAQ | RUM (web-vitals → analytics) + Lighthouse CI budget |
| PERF-2 | API **p95 ≤ 200 ms** and p99 ≤ 500 ms for read endpoints. Writes: p95 ≤ 400 ms | Prometheus histograms |
| PERF-3 | Price update visible in the browser **≤ 2 s** after the worker commits it | Synthetic probe (commit timestamp vs SSE receive) |
| PERF-4 | JS budget: ≤ 170 KB gzip initial JS per public route. Chart library is lazy-loaded | CI bundle-size check |
| PERF-5 | Fonts: self-hosted Vazirmatn subsets (Persian + Latin) as `woff2`, `font-display: swap`, ≤ 2 preloaded weights | Lighthouse |
| PERF-6 | Price table with 500 rows renders without jank (virtualize if > 200 rows) | Playwright perf trace |

## 3. Availability and reliability

| ID | Requirement |
|---|---|
| AVL-1 | Public site availability **99.5 %/month** (≈ 3.6 h downtime). Admin 99 %. Planned maintenance is announced and happens outside market hours |
| AVL-2 | If a price source fails, the site keeps serving the last known price, **labeled with its time**. It never shows an error instead of prices |
| AVL-3 | If Redis is down, pages still render from Postgres. SSE degrades to periodic revalidation |
| AVL-4 | If the SMS provider is down, sign-up shows a clear error. Existing password logins still work. Staff get an alert |
| AVL-5 | Deploys have zero downtime (rolling restart + health checks). Migrations are backward compatible |

## 4. Data freshness (per source) ❓ F10

| Source | Expected update | Stale threshold (alert + "manual entry" flag) |
|---|---|---|
| Free market (بازار آزاد) | every 5–15 min in market hours | 60 min in market hours |
| IME (بورس کالا) | after each session, daily | end of the trading day + 2 h |
| Iran Iron Market (تالار آهن) | hourly–daily | 24 h |
| LME | daily (official prices) | 36 h on business days |
| USD rate | every 15–60 min | 3 h |
| IME daily auctions | daily | end of day + 2 h |

The thresholds follow the **Tehran market calendar**: Iran time (UTC+03:30, no DST since 2022), the Sat–Wed working week, and official holidays in `market.holidays`.
A closed market is **not** flagged as stale.

## 5. Recovery (backup / DR)

| ID | Requirement |
|---|---|
| DR-1 | **RPO ≤ 15 min** for Postgres (WAL archiving to Arvan Object Storage) plus a nightly full backup |
| DR-2 | **RTO ≤ 4 h** to restore production on a new server from backups + IaC/compose |
| DR-3 | Retention: daily backups for 14 days, weekly for 8 weeks, monthly for 12 months |
| DR-4 | A **restore drill every quarter** on staging, with the result logged in `docs/guides/OPERATIONS.md` |

## 6. Security (details in [SECURITY.md](SECURITY.md))

SEC-1 OWASP ASVS L2 · SEC-2 TLS 1.2+ everywhere, HSTS · SEC-3 staff 2FA · SEC-4 OTP abuse limits · SEC-5 audit log for all staff writes ·
SEC-6 paid data is never sent to unauthorized clients · SEC-7 dependency and image scanning in CI.

## 7. Scalability

| ID | Requirement |
|---|---|
| SCL-1 | `api` is stateless (session in Keycloak/Auth.js, state in Postgres/Redis), so it scales horizontally behind Caddy |
| SCL-2 | Only one `worker` instance runs periodic jobs (River leader election). Queue workers can scale |
| SCL-3 | Launch sizing: 1 app server (4 vCPU / 8 GB) + a managed or separate Postgres (2 vCPU / 4 GB / SSD). Reviewed at 70 % sustained CPU/RAM |

## 8. Compatibility, accessibility, i18n

| ID | Requirement |
|---|---|
| CMP-1 | Last 2 versions of Chrome, Edge, Firefox and Safari. Android Chrome 100+. iOS Safari 15+ |
| CMP-2 | Responsive from **360 px** to 1920 px. No horizontal scroll |
| A11Y-1 | **WCAG 2.1 AA**: contrast (including gold on white, checked), keyboard navigation, focus rings, ARIA for tabs/accordions/dialogs, and never color alone for up/down (arrows + sign) |
| I18N-1 | Every page is fully usable in **fa (RTL)** and **en (LTR)**. No mixed-direction layout bugs (Playwright screenshots in both) |
| I18N-2 | Numbers: Persian digits in fa, Latin in en. Prices use thousands separators. Money is shown in Toman with the unit always visible |

## 9. SEO

| ID | Requirement |
|---|---|
| SEO-1 | All public pages are server-rendered with unique title/description per locale, canonical, `hreflang` fa/en, and Open Graph |
| SEO-2 | `sitemap.xml` (per locale), `robots.txt`. Locked Gold content isn't indexed (only teasers) |
| SEO-3 | Structured data: `FAQPage` (visible questions only), `Organization`, `BreadcrumbList`, `NewsArticle` for news |
| SEO-4 | Each FAQ question has a stable anchor URL (`/faq#<slug>`) |

## 10. Maintainability

| ID | Requirement |
|---|---|
| MNT-1 | Test coverage: `access`, `billing`, `calculator`, `market` ≥ **90 %** lines. Overall Go ≥ 70 % |
| MNT-2 | Lint/format/typecheck clean. No `TODO` without an issue link |
| MNT-3 | Every architecture decision has an ADR. README "Getting started" works on a clean machine in **≤ 30 min** |
| MNT-4 | All dependencies are pinned. Renovate PRs are merged at least weekly |
