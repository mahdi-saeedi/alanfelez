# API Guidelines

> Applies to `api/openapi.yaml` and every Go handler. Contract-first (ADR-0014): change the spec, then run `task generate`, then implement.

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
- Time series: `GET /v1/series/{id}/points?from=…&to=…&interval=1h`. The server downsamples, and the tier limits the range (a longer range is clipped and the response says so).

## 4. Errors — RFC 9457 problem details
```json
{ "type": "https://alanfelez.ir/problems/feature-locked", "title": "Feature locked",
  "status": 403, "code": "FEATURE_LOCKED", "detail": "…", "feature": "forecast.read", "requiredPlan": "gold",
  "requestId": "01J…" }
```
- `code` is a stable machine string from the catalog below. Clients switch on `code`, never on `title` or `detail`.
- Validation errors add `errors: [{ "field": "weight", "code": "MIN", "message": "…" }]`.
- User-facing messages are translated **in the UI** from `code`. The API `detail` is for developers.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Request didn't pass validation |
| `UNAUTHENTICATED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Wrong role or not the owner |
| `FEATURE_LOCKED` | 403 | Tier too low (includes `requiredPlan`) |
| `NOT_FOUND` | 404 | |
| `CONFLICT` | 409 | State conflict (e.g. order already paid) |
| `IDEMPOTENCY_MISMATCH` | 422 | Same key, different body |
| `RATE_LIMITED` | 429 | Includes a `Retry-After` header |
| `UPSTREAM_UNAVAILABLE` | 502/503 | Gateway, SMS or source down |
| `INTERNAL` | 500 | Unexpected. Always has a `requestId` |

## 5. Idempotency and concurrency
- Every `POST` that creates money-related or side-effect resources (orders, payments, tickets) accepts an **`Idempotency-Key`** header. The same key + same body returns the same response (stored for 24 h).
- Editable admin resources return an `ETag`. Updates send `If-Match` (optimistic locking, `412` on mismatch).

## 6. Versioning and deprecation
- Additive changes (new optional fields or endpoints) don't need a new version. **oasdiff** in CI blocks breaking changes on `/v1`.
- A breaking change means `/v2` for the affected resources. `/v1` is kept for **≥ 3 months**, with `Deprecation` and `Sunset` headers and a changelog entry.
- Clients must ignore unknown fields.

## 7. Caching and rate limits
- Public reads: `Cache-Control: public, max-age=… , stale-while-revalidate=…` per endpoint (CDN-friendly). Personalized responses use `private, no-store`.
- Rate limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. Limits come from SECURITY §5.

## 8. SSE (`GET /v1/prices/stream`)
- Events: `event: price` with `data: {seriesId, amount, currency, unit, observedAt, changePct}`, sent with an `id` so `Last-Event-ID` resume works.
- Heartbeat comment every 25 s. The server can send `event: reload` to force the client to refetch after a deploy.
- Optional filter: `?series=1,2,3`. Anonymous clients get the public series only (tier rules apply).
