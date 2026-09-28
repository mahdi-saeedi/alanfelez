# ADR-0008: Background jobs with River (Postgres-backed queue)

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
Price ingestion, stale-source detection, IME auction import, SMS price alerts and subscription reminders run on schedules and need retries and visibility.

## Decision
Use **River** in `cmd/worker`: periodic jobs, retries with backoff, unique jobs, and **transactional enqueue** (a job is inserted in the same transaction as the data that triggers it). The River UI is exposed to staff behind admin auth.

## Consequences
No extra queue infrastructure, and no lost or duplicate jobs when a transaction rolls back. Job throughput is bounded by Postgres, which is plenty for this workload.

## Alternatives considered
asynq (Redis-based: no transactional enqueue), cron + scripts (no retries or visibility).
