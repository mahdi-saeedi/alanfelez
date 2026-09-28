# ADR-0020: GitOps delivery with Argo CD, canary releases with Argo Rollouts, one-step rollback

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
Deploys must be automatic after merge, identical for every developer, auditable, and easy to roll back. Supersedes the deploy part of ADR-0013. CI (tests, builds, scans) stays on GitHub Actions.

## Decision
**CI** (GitHub Actions) builds and pushes images tagged with the git SHA, then **commits the new tag** to `deploy/environments/staging/values.yaml`. Production is bumped by a PR created on release tags. **Argo CD** (app-of-apps in `deploy/argocd/`) watches the repo and syncs each environment, with auto-sync and self-heal. A **PreSync hook Job** runs `alanfelez bootstrap` before every rollout. **Argo Rollouts** deploys `api` and `web` as canaries (replica-based, no traffic router needed): `setWeight 50` → analysis step → pause → 100 %. `setWeight` completes only when the new pods are Ready. If they never are, `progressDeadlineSeconds: 180` + `progressDeadlineAbort` aborts. The analysis step measures only the new pods through a `-canary` Service whose selector **Argo Rollouts pins to the canary ReplicaSet**. The Argo CD Application ignores that selector (`ignoreDifferences` + `RespectIgnoreDifferences`), otherwise self-heal reverts it and the analysis would measure the stable pods (found in local testing). Selecting by ephemeral pod labels was also tried and rejected: it races with relabelling right after a promotion. Today the analysis checks `/readyz` via the web metric provider. Prometheus error-rate and p95 latency are added with the observability stack. Argo CD uses server-side diff, so operator defaults aren't drift. Manual rollback = the "Rollback" GitHub workflow or `git revert` of the bump commit. The Argo CD UI rollback is for emergencies only.

## Consequences
Every deploy and rollback is a git commit (who, what, when). No cluster credentials in CI (Argo pulls). Bad releases are caught at 20 % traffic. Requires backward-compatible migrations (expand/contract), which is already the policy.

## Alternatives considered
Push-based deploys from CI with kubectl/helm (CI needs cluster credentials, drift possible), Flux (equivalent, but the lead dev prefers Argo CD).
