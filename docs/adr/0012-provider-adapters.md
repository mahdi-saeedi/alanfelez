# ADR-0012: Adapter interfaces for payments, SMS and data sources

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The payment gateway, SMS provider and price APIs aren't final, and Iranian providers change often.

## Decision
Go interfaces in `internal/integrations`: `payment.Gateway` (Create/Verify, idempotent by order ID), `sms.Provider` (Send, template), `pricesource.Source` and `auctionsource.Source` (Fetch → normalized, validated records). One package per provider, selected by config. Every source also supports **admin manual entry** as a fallback (client answer #8).

## Consequences
Switching providers doesn't touch business logic. Adapters are tested with recorded fixtures.

## Alternatives considered
Provider SDK calls inside business code (lock-in, hard to test).
