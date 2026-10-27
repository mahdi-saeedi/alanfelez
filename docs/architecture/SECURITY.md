# Security Baseline & Threat Model

> Status: **Proposed**. Target: **OWASP ASVS 4.0 Level 2**. Reviewed before each production release (checklist in §10).
> Report vulnerabilities to: *(set the security contact in site settings, and publish `/.well-known/security.txt`)*.

## 1. What we protect (assets)
| Asset | Why it matters |
|---|---|
| **Paid market data** (full price table, history, analyses, forecasts, IME auction data) | It's the product. If it leaks, nobody needs to subscribe |
| User accounts (phone numbers, names, emails) | Personal data. Account takeover |
| Payments and subscriptions | Money, fraud, disputes |
| Admin panel and manual price entry | A fake price published under our brand damages trust and could move a market |
| SMS budget | OTP abuse costs real money |
| Availability during market hours | Users depend on it for trading decisions |

## 2. Threats (STRIDE summary) and controls

| # | Threat | Control |
|---|---|---|
| T1 | **SMS pumping / OTP flooding** (spoofing + DoS on the budget) | §4 |
| T2 | **Scraping paid data**, or sharing one Gold account | §5 |
| T3 | **Tampered or false prices** (compromised source, staff mistake, malicious insider) | §6 |
| T4 | Payment callback forgery or replay, double-crediting | §7 |
| T5 | Admin account takeover | Keycloak **TOTP 2FA required for all staff roles**, admin on a separate host (`admin.alanfelez.ir`), short sessions (30 min idle), IP allow-list optional, and every staff write goes to `audit_log` |
| T6 | XSS through rich-text content or the FAQ | TipTap HTML → **bluemonday** allow-list sanitize **on every write**, stored sanitized (ADR-0025). The website renders it only through `RichText` / the FAQ answer block. Plain-text fields are escaped by React. JSON-LD is escaped (`<` → `\u003c`). Strict **CSP** with per-request nonces (`apps/web/src/lib/security-headers.ts`, `'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`) |
| T7 | Broken access control (IDOR, paid data in the API) | Every handler calls `access.Can`. Resource ownership is checked in the SQL (`WHERE user_id = $1`). Locked features return teaser payloads only. Negative tests exist per endpoint |
| T8 | Injection | sqlc parameterized queries only. OpenAPI request validation. No string-built SQL |
| T9 | CSRF | Web: Auth.js session cookie `SameSite=Lax` + CSRF token on mutations. API: bearer tokens only (no cookie auth on the Go API) |
| T10 | Secrets leakage | No secrets in git (gitleaks in CI + pre-commit). Secrets in GitHub Environments → server `.env` (mode 600). Rotated on staff change |
| T11 | Vulnerable dependencies and images | Renovate, govulncheck, `pnpm audit`, Trivy image scan (CI fails on HIGH/CRITICAL with a fix available). Distroless base images |
| T12 | DoS / traffic floods | Arvan CDN/WAF in front. Caddy and API rate limits. SSE connection caps per IP and per user |
| T13 | Data loss or ransomware | Backups off-server (Object Storage, versioned, separate credentials), restore drills (OPERATIONS §5) |

## 3. Authentication (Keycloak)
- Mobile sign-up requires OTP. OTP = 6 digits, **valid 2 min**, max 5 attempts, then the code is burned.
- Passwords (optional): minimum 10 characters, checked against a breached-password list if feasible. Keycloak **brute-force detection** is on (temporary lockout).
- Tokens: access 5 min, refresh with rotation. Sessions: users idle 7 days / max 30 days, staff idle 30 min / max 12 h.
- Go validates the `iss`, `aud`, `exp` and `nbf` claims and the signature via JWKS (cached, with rotation handled).
- Staff roles are only assigned manually by an `admin`. Keep the role list minimal: `admin`, `editor`, `support`.

## 4. OTP / SMS abuse controls (T1)
Every limit is configurable. Defaults:

| Control | Default |
|---|---|
| Code lifetime | 5 min (client, 2026-10-24: SMS can take a minute); 5 tries per code |
| Resend cooldown per phone | 120 s |
| OTPs per phone | 5 / hour, 10 / day |
| OTPs per IP | 10 / hour |
| Allowed destinations | **Iranian mobile numbers only** (`+989…`), with format validation |
| CAPTCHA (self-hosted, e.g. ALTCHA / proof-of-work, since Google reCAPTCHA is unreliable in Iran) | Required after 2 OTP requests from the same IP or phone within 1 h |
| Global circuit breaker | If SMS spend exceeds the **daily budget** (setting), OTP sending pauses except for existing users, and staff get an alert. Price alerts (M5) already pause at the budget (`internal/alerts`) and are capped at 10 SMS per user per day |
| Monitoring | Alert on OTP rate above 3× the 7-day baseline |

### Contact form abuse (M4)
| Control | Default |
|---|---|
| Rate limit per client IP | 5 / hour and 20 / day (`internal/platform/ratelimit`, Redis). Fails open if Redis is down (logged) |
| Honeypot field | A hidden `website` input; bots that fill it get the normal `202` and nothing is stored |
| Validation | Name 2–100, phone digits (Persian digits accepted), optional e-mail, body 10–5000 chars; plain text only |
| Client IP | `httpx.ClientInfo`: `X-Forwarded-For` is believed only from `TRUSTED_PROXIES` (default: private ranges), taking the right-most untrusted hop, so a client can't spoof it. The website forwards the header it received |

## 5. Paid-data protection (T2)
- **The server never sends locked data**: no hidden fields, no CSS-only blur. Teasers are generated server-side. Locked analyses and
  forecasts are listed with title, summary and cover only; their body is omitted from the response (tested in `content_integration_test.go`).
- API rate limits (M6, `internal/api/ratelimit.go`): 300 req/min per signed-in user, 120 req/min per client IP for anonymous
  callers; staff and the website server (trusted proxy without a forwarded client) are exempt; the SSE stream isn't counted.
  A history-range limit per request comes from the tier (chart.history_days).
- No bulk export endpoints for users. Chart history is paginated by range.
- **Deleting a user** (owner, 2026-10-27): admin role only, confirmed and audited (`user.delete`, no personal data in the
  entry). The API calls Keycloak's Admin API as the service account `alanfelez-api-admin` (realm-management `manage-users`
  and `view-users` only; secret `alanfelez-keycloak-api-admin`, sealed, only in the API pods and the profile job) to delete
  the account and its sessions; then name, mobile, email, sign-up answers, SMS choice, alerts and saved calculations go.
  Orders, payments, subscriptions and tickets stay without a name. Staff accounts and your own can't be deleted this way.
- **Concurrent session limit** (owner, 2026-10-27): at most 2 devices signed in per account, for **every** account; signing in on a
  third signs out the oldest (Keycloak «User Session Count Limiter» in the browser flow, `keycloak.sessionLimit`). Paid-only would
  need a Java extension. Seeing and revoking devices on the account page is not built yet.
- `robots` rules and `noindex` for anything behind a lock. Watermark PDF exports (Gold) with the user ID.

## 6. Price integrity (T3)
- Ingested points go through schema validation, unit/currency checks, and an **outlier gate** (jump > `max_jump_pct` → quarantined, staff approve or reject).
- Manual entry is limited to the `editor`/`admin` roles. Every manual point records `entered_by` and is audit-logged. A bulk CSV upload shows a diff and needs confirmation.
- Public price rows always show the **source** and the **time**. Manual entries show the market as the source (the internal `is_manual` flag isn't shown publicly).
- A 4-eyes option (feature flag): manual changes above the threshold need a second staff approval.

## 7. Payments (T4)
- The callback is never trusted. It triggers a **server-to-server verify** with the gateway. The amount and order ID must match our records.
- Idempotency: unique `payments.authority`, and the order state machine allows `pending → paid` only once. The subscription is created in the same transaction.
- A reconciliation job (daily) compares gateway reports with orders and alerts on mismatches (with the real gateway, F13).
- Built in M3: `POST /v1/payments/verify` is public (the callback can outlive the session) and trusts nothing it receives: it
  checks the authority belongs to the order, calls the gateway's verify with the order's amount, and activates the plan in the
  same transaction that marks the order paid. Repeating it is a no-op. An order that expired while the user was on the gateway
  page is still honoured if the gateway confirms the payment (the money was taken).
- The mock gateway and the console SMS sender are refused in production by config validation.
- No card data ever touches our servers (the gateway's hosted page).

## 8. Transport, headers, cookies
- TLS 1.2+ (Caddy automatic certificates), **HSTS** (`max-age=31536000; includeSubDomains`), HTTP → HTTPS redirect.
- Headers: `Content-Security-Policy` (nonce-based, no `unsafe-inline` scripts), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation off), `frame-ancestors 'none'`.
- Cookies: `Secure`, `HttpOnly`, `SameSite=Lax`, with the `__Host-` prefix where possible.
- CORS: the API allows only `alanfelez.ir`, `www.`, `admin.` and the staging origins.

## 9. Privacy and data handling
- Collect only what's needed: mobile number (required), name, email (optional). **No national ID** (client answer #18).
- Personal data is never logged. Phone numbers are masked in logs (`+98912***4567`).
- Data stays on Iranian infrastructure (ArvanCloud). Processors: SMS provider, payment gateway, Keycloak (self-hosted).
- Users can export or delete their account (delete = anonymize, but financial records are kept 10 years as legally required).
- The Privacy Policy text reflects this section (SCOPE §11).

## 10. Release security checklist
- [ ] CI security jobs green (gitleaks, govulncheck, Trivy, pnpm audit)
- [ ] New endpoints: access check + negative test (wrong tier, other user's resource, anonymous)
- [ ] New rich-text or HTML rendering path: sanitized + CSP still passes
- [ ] New staff action: audit-logged
- [ ] New secret: added to GitHub Environments + `.env.example` (placeholder only)
- [ ] Rate limits on any new public mutation endpoint
- [ ] Before major releases: ZAP baseline scan against staging
