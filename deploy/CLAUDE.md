# Deploy and servers (`deploy/`)

Staging and production are k3s clusters on ArvanCloud, deployed by **Argo CD from this git repo** (GitOps), with Argo Rollouts
canaries and automatic rollback. The full flow is `docs/guides/DEPLOYMENT.md`; running it is `docs/guides/OPERATIONS.md`;
the go-live checklist is `docs/guides/LAUNCH.md`. Keep those docs in step with this folder in the same PR.

## Where things are
| Path | What |
|---|---|
| `helm/alanfelez/` | The app chart: api, worker, web, admin, keycloak, bootstrap job (migrate + seed), ingress. `values.yaml` documents every setting |
| `helm/alanfelez-data/` | Postgres + Redis for the cluster |
| `environments/<local\|staging\|production>/values.yaml` | **What runs in each environment.** Image tags here are written by the release workflow |
| `environments/<env>/secrets/` | SealedSecrets only (encrypted). Never a plain secret |
| `argocd/` | Argo CD install values, the project, and one root app per environment |
| `local/` | Local k3d cluster (`task k8s:*`), local Keycloak users, the smoke test script |
| `loadtest/public.js` | k6 load test (`task loadtest`) |

## How a change reaches a server (the only way)
```
branch → PR → CI green → owner merges to main → release workflow pushes images and commits the tag to environments/staging
       → Argo CD syncs staging (bootstrap job, canary)          ← staging = "main", automatically
tag vX.Y.Z → PR bumping environments/production → owner merges → Argo CD syncs production (canary, auto-rollback)
```
Rollback = revert that commit (the Rollback workflow, DEPLOYMENT §5). A config change (a flag in `values.yaml`, a resource
limit) is the same: edit the file in a PR. Feature flags and site settings are changed in the **admin panel**, not in git.

## Access to the clusters (Claude and developers)
Kube contexts have fixed names. Always pass `--context` explicitly; never rely on the current context.
| Context | Environment | What you may do |
|---|---|---|
| `k3d-alanfelez` | local k3d | Anything (it's disposable: `task k8s:up` rebuilds it) |
| `alanfelez-staging` | staging | Read everything; debug (`logs`, `describe`, `get events`, `top`, `port-forward`); `rollout restart` and `argo rollouts promote/abort` when a deploy is stuck. Config changes still go through git |
| `alanfelez-production` | production | **Read-only**: `get`, `describe`, `logs`, `top`, `events`, `argo rollouts get`. Nothing that changes state. If production needs a change, write the PR and tell the owner |
Any other context on the machine is not ours: never use it. The guard hook in `.claude/hooks/guard.mjs` enforces this for Claude.
A developer's production kubeconfig should itself be read-only (a `view` ClusterRole), so the rule doesn't depend on the hook.

## Debugging a problem on staging or production
1. `kubectl --context <ctx> -n alanfelez get pods` and `argo rollouts --context <ctx> -n alanfelez get rollout alanfelez-api`
2. Logs: `kubectl --context <ctx> -n alanfelez logs deploy/alanfelez-worker --since 30m` (JSON logs; every request has a `request_id`,
   which is also in the error the user saw)
3. Argo CD: is the app `Synced` and `Healthy`? A failed bootstrap job (migration) blocks the sync: read its logs.
4. Find the cause in the code, fix it on a branch, PR. Don't patch the cluster.

## Rules
- Nobody runs `kubectl apply/edit/patch/delete`, `helm install/upgrade` or `exec` into production pods. Git is the source of truth.
- Production database: no direct writes. Data fixes are migrations or admin actions (audited). Reading is for the owner only.
- Secrets: `kubeseal` them into `environments/<env>/secrets/`; never commit a plain secret, never paste one into a chat.
- `environments/production/**` changes need the owner's review (CODEOWNERS), and so do `helm/**` changes that affect production.
- Chart changes: `task helm:lint` (also part of `task check`), and try them on local k3d (`task k8s:sync`) before staging.
