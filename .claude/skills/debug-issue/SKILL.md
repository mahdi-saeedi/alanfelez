---
name: debug-issue
description: Find the cause of a bug or error, locally or on staging/production (logs, request ids, Argo CD, database). Use when something is broken, slow, shows an error, or "doesn't work".
---

# Debug a problem

Find the cause before changing code. Write down what you saw, what you expected, and the steps to reproduce.

## Locally (Docker Compose)
1. `task ps` — every service `healthy`? `task logs -- api` / `worker` / `web` / `keycloak` / `bootstrap`.
2. API errors carry a `requestId` (in the problem JSON the page got). Search it: `docker compose logs api | grep <id>`.
3. Reproduce with curl against http://localhost:8080 (anonymous) or in the browser pane (signed in); check the console
   and network panes. CSP violations show in the console.
4. Database: `docker compose exec postgres psql -U alanfelez alanfelez` (local only). Read-only queries while investigating.
5. Stale code in a container? Rebuild the one app: `task api:reload` / `task web:reload` / `task admin:reload`.
6. Docker problems (disk full, pulls hanging): `docker system df`; ask the user before pruning anything or restarting Docker.

## Staging / production
Rules and contexts: `deploy/CLAUDE.md`. Production is **read-only**.
1. `kubectl --context alanfelez-staging -n alanfelez get pods`, `... describe pod <pod>`, `... get events --sort-by=.lastTimestamp`
2. `kubectl --context <ctx> -n alanfelez logs deploy/alanfelez-worker --since 1h | grep <requestId or error>`
3. Canary stuck or aborted: `kubectl argo rollouts --context <ctx> -n alanfelez get rollout alanfelez-api`
4. Argo CD app not Healthy: a failed `bootstrap` job (migration/seed) is the usual cause; read its logs.

## Then
- Write a failing test that reproduces the bug (unit or integration), fix, see it pass. `task check`.
- Ship with the `ship-change` skill. For production incidents also follow `docs/guides/OPERATIONS.md` §7 and tell the owner.
