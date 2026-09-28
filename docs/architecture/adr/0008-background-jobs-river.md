# ADR-0008: Background jobs with River (Postgres-backed queue)

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
Price ingestion, stale-source detection, IME auction import, SMS price alerts and subscription reminders run on schedules and need retries and visibility.

## Decision
Use **River** in the `alanfelez worker` subcommand (same binary and image as the API): periodic jobs, retries with backoff, unique jobs, and **transactional enqueue** (a job is inserted in the same transaction as the data that triggers it). The River UI is exposed to staff behind admin auth.

## Consequences
No extra queue infrastructure, and no lost or duplicate jobs when a transaction rolls back. Job throughput is bounded by Postgres, which is plenty for this workload.

## Alternatives considered
asynq (Redis-based: no transactional enqueue), cron + scripts (no retries or visibility).

## Implementation notes (M2)
- River's tables live in the `river` schema. `alanfelez migrate` (and so `bootstrap`) runs River's migrations after goose.
- One periodic `prices.fetch` job per active source, built from `market.sources` when the worker starts
  (`fetch_interval_s`, run on start, unique while queued/running, one attempt: the next tick is the retry).
  Restart the worker (a rollout) after adding or re-timing a source.
- Periodic jobs run on the elected leader only, so running more than one worker replica is safe.

