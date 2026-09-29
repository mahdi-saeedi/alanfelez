# API Guidelines

> Applies to `contracts/openapi.yaml` and every Go handler. Contract-first (ADR-0014): change the spec, then run `task generate`, then implement.

## 1. Basics
- Base path **`/v1`**. JSON only (`application/json; charset=utf-8`). Field names are `camelCase`.
- Resources are plural nouns: `/v1/prices`, `/v1/articles/{slug}`. Use actions only where REST doesn't fit: `POST /v1/calculator/estimate`.
- Admin endpoints live under **`/v1/admin/...`** and require staff roles. Public and user endpoints never return admin-only fields.
- Locale via `Accept-Language: fa|en` (default `fa`). Responses contain only the requested locale's text fields, except in `/v1/admin` (both).

## 2. Data formats
| Kind | Format |
|---|---|
| Money | `{ "amount": "12500000", "currency": "IRR" }`. **amount = string** of the integer minor unit (avoids JS precision loss). The UI formats it as Toman |
| Price | `{ "amount": "...", "currency": "IRR", "unit": "kg" }` |
| Time | RFC 3339 UTC (`2026-09-28T07:30:00Z`). Never Jalali in the API |
| Dates (session day) | `YYYY-MM-DD` (Gregorian) |
| IDs | uuid strings, or `slug` for public resources |
| Enums | lower snake case strings (`quarter`, `move_pct`) |

## 3. Lists
- Cursor pagination: `?limit=20&cursor=…` → `{ "items": [...], "nextCursor": "…" | null }`. `limit` max 100.
- Filtering with explicit params (`?metal=copper&category=scrap`), sorting with `?sort=-observedAt`.
- Time series: `GET /v1/series/{slug}/points?range=1M` (`1D 1W 1M 3M 6M 1Y 3Y MAX`). The server downsamples to ≤ ~300 points (last price per bucket, buckets aligned to Tehran midnight). A range beyond the tier's limit is refused with `FEATURE_LOCKED` (not clipped), so the UI can show the lock on that range button.

## 4. Errors — RFC 9457 problem details
```json
{ "type": "https://alanfelez.ir/problems/feature-locked", "title": "Feature locked",
  "status": 403, "code": "FEATURE_LOCKED", "detail": "…", "feature": "forecast.read", "requiredPlan": "gold",
  "requestId": "01J…" }
```
- `code` is a stable machine string from the catalog below. Clients switch on `code`, never on `title` or `detail`.
- Validation errors add `errors: [{ "field": "weight", "code": "MIN", "message": "…" }]`.
- User-facing messages are translated **in the UI** from `code`. The API `detail` is for developers.
- In the contract, newer operations (M4 on) declare errors as `default: Problem` only, and list the codes they can return in
  the summary; handlers answer any status through one helper (`fail[…]`). Older operations list each status separately; both
  produce the same wire format.
- The generated server does **not** enforce schema bounds (`maxLength`, `minimum`, `maxItems`): handlers validate and clamp
  themselves, and every request body is capped at 2 MB (`httpx.MaxBodyBytes`).

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Request didn't pass validation |
| `UNAUTHENTICATED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Wrong role or not the owner |
| `FEATURE_LOCKED` | 403 | Tier too low (includes `requiredPlan`) |
| `NOT_FOUND` | 404 | Also for someone else's resource (an order of another user looks like no order) |
| `PAYMENTS_DISABLED` | 409 | Checkout while the `payments.enabled` flag is off |
| `NOT_REFUNDABLE` | 409 | Refund requested after 7 days or after a paid feature was used |
| `CONFLICT` | 409 | State conflict (e.g. order already paid, point already reviewed, duplicate point) |
| `PRICE_JUMP` | 422 | Manual price moves more than the series' outlier threshold; resend with `force: true` to confirm |
| `IDEMPOTENCY_MISMATCH` | 422 | Same key, different body |
| `RATE_LIMITED` | 429 | Too many requests: 300/min per user, 120/min per anonymous IP (with `Retry-After`), or the contact form's 5/hour, 20/day per IP |
| `UPSTREAM_UNAVAILABLE` | 502/503 | Gateway, SMS or source down |
| `INTERNAL` | 500 | Unexpected. Always has a `requestId` |

## 5. Idempotency and concurrency
- Every `POST` that creates money-related or side-effect resources (orders, payments, tickets) accepts an **`Idempotency-Key`** header. The same key + same body returns the same response (stored for 24 h).
- Editable admin resources return an `ETag`. Updates send `If-Match` (optimistic locking, `412` on mismatch).
  Exception: static pages carry their `version` in the body and a stale save is `409 CONFLICT` (the editor shows "someone else saved").
- Tickets use `Idempotency-Key` too: the same key returns the ticket created the first time (`200` instead of `201`).

## 6. Versioning and deprecation
- Additive changes (new optional fields or endpoints) don't need a new version. **oasdiff** in CI blocks breaking changes on `/v1`.
- A breaking change means `/v2` for the affected resources. `/v1` is kept for **≥ 3 months**, with `Deprecation` and `Sunset` headers and a changelog entry.
- Clients must ignore unknown fields.

## 7. Caching and rate limits
- Public reads: `Cache-Control: public, max-age=… , stale-while-revalidate=…` per endpoint (CDN-friendly). Personalized responses use `private, no-store`.
- Rate limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. Limits come from SECURITY §5.

## 8. SSE (`GET /v1/prices/stream`)
- Events: `event: price` with `data: {series, price: {amount, currency, unit}, change: {amount, bp}, observedAt}` (`PriceEvent` in the spec). Every stream starts with the current price of each visible series, so a reconnect always re-syncs; `id` is the point id.
- Heartbeat comment every 25 s. The server can send `event: reload` to force the client to refetch after a deploy.
- Optional filter: `?series=slug-a,slug-b`. Anonymous and free clients get base series only (tier rules apply). The stream is served by hand (`internal/prices/live`), not by the generated server.
- Browsers can't send an `Authorization` header with `EventSource`, so the website proxies the stream through its own server route and adds the user's token there.
