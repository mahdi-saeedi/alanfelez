# ADR-0024: Billing: orders with server-side verification, queued renewals, prorated upgrades

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
Plans are sold through an Iranian payment gateway that isn't chosen yet (F13). Gateways redirect the browser back with a status
that anyone can forge, callbacks can repeat, and none supports automatic refunds or card-on-file renewals. Subscription periods
must never overlap or lose paid days, and the refund rule depends on whether paid features were used (SCOPE §6).

## Decision
- `internal/billing` owns orders, payments, subscriptions and refunds. The pricing rules are pure functions (`rules.go`,
  table-tested): renewals and downgrades are **queued** after what the user holds; upgrades start now with the unused paid value
  of lower plans as **credit**; periods are fixed days; remainders under 1,000 Toman are waived.
- **Checkout** is idempotent per `Idempotency-Key` and runs under a per-user Postgres advisory lock. Placement is recomputed when
  the payment completes, so two orders finishing together queue instead of overlapping (no DB exclusion constraint needed, which
  would require the `btree_gist` extension).
- **Verification** is server-to-server: the website's callback hands the query to `POST /v1/payments/verify`; the API calls the
  gateway's verify with the stored amount and activates the plan in the same transaction as `pending → paid`. Repeat-safe.
- Gateways sit behind `payment.Gateway` (ADR-0012). `mock` (with its own page) for local/staging, `none` until a real one exists.
- **Paid-feature usage** is recorded when the API delivers tier-gated data (first use per subscription/feature), which makes the
  refund rule objective. Refunds are requested by users, decided by admins, and paid back by hand.
- All billing timestamps come from the **database clock**, because "active" is decided by `now()` in SQL.

## Consequences
Real gateway work is one adapter plus fixture tests. Checkout works end to end today (mock). Staff do refund transfers by hand,
which is fine at launch volume. A daily reconciliation with gateway reports comes with the real gateway.

## Alternatives considered
Trusting the callback status (forgeable), overlapping subscriptions with "max tier" resolution (loses paid days and complicates
refunds), prorating by calendar months (Jalali/Gregorian month lengths differ), refunds via gateway APIs (not available).
