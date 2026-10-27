# Deployment: staging & production

> Kubernetes (k3s) on ArvanCloud, deployed by **Argo CD** (GitOps), with **Argo Rollouts** canaries and automatic rollback.
> Status: implemented and tested end to end on a local k3d cluster (`task k8s:*`, LOCAL_SETUP.md §7). That covers GitOps sync,
> the bootstrap job, canary promotion through the analysis step, automatic abort of a broken release, and git-revert rollback.
> Staging/production need the one-time setup in §3.
> Keep this doc in step with `deploy/`. If a step changes, update it in the same PR.

## 1. How a change reaches users

```
ship/<slug> branch (Claude, from the chat) or a pull request ──► CI (.github/workflows/ci.yml): Go · Keycloak ext ·
      web/theme · Helm+kubeconform · image builds · smoke · security
      │ green → ship.yml squash-merges to main (or a person presses Merge)
      ▼
Release workflow: build + push images :sha-<12> to the Arvan registry (with SBOM, provenance, Trivy scan)
                  commit the new tag to deploy/environments/staging/values.yaml        ← the deploy IS a git commit
      ▼
Argo CD (staging) syncs automatically, in order (sync waves):
  platform operators → alanfelez-data (Postgres/Redis) → alanfelez:
  1. PreSync hook Job `alanfelez bootstrap` (migrations + seed)                          ← from-scratch safe, idempotent
  2. Keycloak, admin: rolling update · api, web: Argo Rollouts canary
       setWeight 50 (completes only when the new pods are Ready) → analysis (api) → pause 30 s → 100 %
  3. New pods never Ready → abort at the progress deadline (180 s). Analysis fails → abort immediately.
     Either way the stable version keeps serving and nothing reaches git
      ▼
publish/production branch (Claude, after the stakeholder's OK) or Actions → Publish to production ──► publish.yml:
  the images staging runs are tagged vX.Y.Z (no rebuild), committed to deploy/environments/production/values.yaml,
  GitHub release created (ADR-0026)
      ▼
Argo CD (production): same hook + canary + automatic rollback
```

Nobody runs `kubectl apply` or `helm upgrade` by hand. **Git is the source of truth**: what's in `deploy/environments/<env>` is what runs.

## 2. Environments

| | local (k3d) | staging | production |
|---|---|---|---|
| Deployed from | `task k8s:deploy` (Gitea in the cluster) | every merge to `main` (automatic) | *Publish to production* (`publish/production` branch or the Actions button) |
| Hostnames | `alanfelez.localhost:8088`, `admin.`, `api.`, `auth.` | `staging.alanfelez.ir`, `admin.staging…`, `api.staging…`, `auth.staging…` (no password, noindex) | `alanfelez.ir`, `admin.alanfelez.ir`, `api.alanfelez.ir`, `auth.alanfelez.ir`; `www.` and `alanfelez.com` → 301 (test mode until launch) |
| `APP_ENV` | `local` | `staging` | `production` |
| `SEED_PROFILES` | `reference,demo` | `reference,demo` | `reference` (demo is **refused** in production) |
| OTP SMS provider | `console` (codes in the Keycloak log) | `console` or the real provider in test mode | real provider, `keycloak.otp.consoleAllowed: false` |
| Payment gateway (`api.paymentGateway`) | `mock` (fake gateway page, no money) | `mock` until the sandbox of the real gateway (F13) | `none` until the real gateway is added: the site runs, checkout says "unavailable". `mock` is refused |
| Reminder SMS (`api.smsProvider`) | `console` (worker log) | `console` | `none` (no reminders) until the SMS provider (F7). `console` is refused |
| `payments.enabled` flag | on (demo seed) | on (demo seed) | off until the gateway is live; switch it in the admin |
| Keycloak users | OTP sign-up | test users allowed | no seeded users. Staff are created by an admin, with mandatory TOTP |
| Secrets | `devSecrets.enabled: true` (chart-generated) | SealedSecrets | SealedSecrets |
| Backups | none | nightly | WAL archiving (RPO 15 min) + nightly, restore drill every quarter |

## 3. Starting an environment from scratch (one-time)

Everything below is declarative. A brand-new cluster reaches the same state with these steps:

1. **Cluster:** create ArvanCloud VM(s) (launch sizing: NFR SCL-3) and install **k3s** (`curl -sfL https://get.k3s.io | sh -`),
   or use Arvan managed Kubernetes. Point DNS for the hostnames in §2 at the ingress IP (Arvan CDN in front).
2. **Registry:** create the ArvanCloud Container Registry. Set GitHub `vars.REGISTRY_HOST`, `vars.REGISTRY` (`<host>/alanfelez`),
   `secrets.REGISTRY_USERNAME`, `secrets.REGISTRY_PASSWORD`. Then replace `REGISTRY_HOST` in `deploy/environments/<env>/values.yaml`.
3. **Argo CD:**
   ```bash
   helm repo add argo https://argoproj.github.io/argo-helm
   helm upgrade --install argocd argo/argo-cd --version 10.9.2 -n argocd --create-namespace -f deploy/argocd/install/values-cluster.yaml
   ```
4. **Secrets:** Argo CD installs the Sealed Secrets controller (wave −3). Then create each secret with `kubeseal` and commit the
   encrypted files (see `deploy/environments/<env>/secrets/README.md`): `alanfelez-app`, `alanfelez-keycloak-admin`,
   `alanfelez-keycloak-db`, `alanfelez-backup-s3`, `arvan-registry`. Plain secrets never go into git.
5. **Root app (app-of-apps):**
   ```bash
   kubectl apply -f deploy/argocd/projects/alanfelez.yaml -f deploy/argocd/roots/root-<env>.yaml
   ```
   Argo CD then installs, in order: Argo Rollouts, CloudNativePG, cert-manager, Sealed Secrets (wave −3) → secrets (−2) →
   `alanfelez-data`: Postgres cluster + Keycloak database/role, Redis (−1) → `alanfelez`: bootstrap job, Keycloak, api, web, admin (0).
6. **First sync:** the PreSync `bootstrap` Job creates the schema and **loads the initial data** from `config/seed/reference`
   (baked into the API image). Keycloak imports the realm that's baked into its image (`--import-realm`, only if it doesn't exist).
7. **First admin:** log in to the Keycloak console with the bootstrap admin (`alanfelez-keycloak-admin` secret), create the first staff
   user, and assign `admin`. They enrol TOTP on first login. Then delete or disable the bootstrap admin.

After that, every later deploy is just a git commit (§1).

## 4. Initial data (seed)

- Source: `config/seed/<profile>/*.yaml`, loaded by `alanfelez bootstrap` / `alanfelez seed` (ADR-0021, `config/seed/README.md`).
- It runs on **every** sync (PreSync hook). It's idempotent: unchanged files are skipped, `insert_missing` never overwrites
  data edited in the admin panel, and an advisory lock prevents parallel runs.
- To add initial data for a new feature, add rows or files and deploy. To change live data, use the admin panel (audited) or a migration.

## 5. Rollback

| Situation | What happens / what to do |
|---|---|
| New pods never become Ready (crash, bad config, dependency down) | **Automatic.** `setWeight 50` can't complete, so at `progressDeadlineSeconds: 180` the rollout aborts (`progressDeadlineAbort`) and scales the canary down. The stable pods serve throughout. *Tested locally:* `task k8s:deploy:broken`, aborted at 180 s, live API stayed ready |
| New pods are Ready but misbehave | **Automatic.** The analysis step (after `setWeight 50`) measures only the new pods through the `-canary` Service, whose selector Argo Rollouts pins to the canary ReplicaSet (Argo CD ignores that field). Any failed check aborts. Today it checks `/readyz`. Error-rate and latency checks (Prometheus) come with the observability stack |
| Bad release is already fully rolled out | **GitHub Actions → "Rollback" workflow**: pick the environment and a version (default: the previous one), or from the chat: Claude pushes a `rollback/production` branch (previous version). It commits the old image tag and Argo CD syncs. Or `git revert` the bump commit, same result. *Tested locally:* `task k8s:rollback` |
| Emergency, CI unavailable | Argo CD UI → app → *History and rollback* → previous revision. This suspends auto-sync, so afterwards revert in git and re-enable auto-sync |
| Database | Migrations are **expand → migrate → contract** (backward compatible for one release), so an app rollback never needs a DB rollback. Restoring data = OPERATIONS §5 (PITR) |

After an automatic abort the rollout stays `Degraded` until git points at a good version again, through a fix or a rollback commit.
That's intentional: git must never claim a version that isn't running. Any deploy or rollback, including one pushed by another developer,
is one commit or one click, and it's fully audited in git history.

## 6. Configuration reference

| Setting | Where |
|---|---|
| Non-secret config (hosts, replicas, log level, seed profiles, rollout steps) | `deploy/environments/<env>/values.yaml` (defaults: `deploy/helm/alanfelez/values.yaml`) |
| Postgres / Redis sizing and backups | `deploy/environments/<env>/data-values.yaml` |
| Secrets | SealedSecrets in `deploy/environments/<env>/secrets/` |
| Image tags | `deploy/environments/<env>/values.yaml` (written by CI; don't edit by hand except for rollbacks) |
| Feature flags, site settings | Admin panel (seeded defaults from `config/seed/reference/30-platform.yaml`) |
| OTP settings (provider, TTL, limits) | Realm file (authenticator config `alanfelez-phone-otp`) or the Keycloak console |
| Argo CD itself | `deploy/argocd/install/values-cluster.yaml` (server-side diff is on, so operator defaults aren't drift) |
| Trusted proxies (`api.trustedProxies`) | Who may set `X-Forwarded-For`. Default: private ranges (ingress, website, pods). **Production behind the Arvan CDN: add the CDN edge ranges** (Arvan publishes them), otherwise every visitor shares the edge's IP and the contact-form rate limit (5/hour per IP) hits them all together. Check with a test message: the admin shows no IP, but `app.contact_messages.ip` should be the visitor's |
| Content (articles, FAQ, pages, contact details) | Admin panel. Initial FAQ/pages come from `config/seed/reference/50-faq.yaml`, `60-pages.yaml` (insert-missing: admin edits are never overwritten) |

## 7. Adding a real SMS provider (e.g. Kavenegar)

1. `services/keycloak/extensions/src/main/java/ir/alanfelez/keycloak/sms/kavenegar/`: implement `SmsSender` + `SmsSenderFactory` (id `kavenegar`).
   Read the API key with `config.get("apiKey")`.
2. Register the factory in `META-INF/services/ir.alanfelez.keycloak.sms.SmsSenderFactory`.
3. Configure it: `KC_SPI_SMS_SENDER__KAVENEGAR__API_KEY` (from a secret, via `keycloak.extraEnv` or a secret ref), and set
   `keycloak.otp.smsProvider: kavenegar` in the environment values.
4. Keep the console sender off: `keycloak.otp.consoleAllowed: false` (`KC_SPI_SMS_SENDER__CONSOLE__ALLOWED`).
   Don't name provider options `enabled`: that's Keycloak's own build-time provider switch.

The authenticator itself doesn't change.

## 8. Servers in Iran: work without the international internet
From an Iranian server, downloads from abroad (GitHub, ghcr.io, Quay, chart sites) run at a few dozen KB/s, and in an
internet shutdown they stop entirely, while ArvanCloud services inside Iran run at full speed (measured: 67 MB/s).
So everything a cluster needs at run time **and** to deploy comes from inside Iran:

| Need | Comes from | How it gets there |
|---|---|---|
| Our images | ArvanCloud registry (`global.imageRegistry`) | Release workflow (builds in GitHub, pushes to the registry) |
| Outside images (Argo CD, cert-manager, CNPG, Postgres, Redis…) | Registry, under `alanfelez/mirror/<original name>` | *Mirror images* workflow, list in `deploy/mirror-images.txt`; each node's `/etc/rancher/k3s/registries.yaml` (template `deploy/server/registries.yaml.example`, login typed on the server with `/root/set-registry-login.sh`) |
| Outside Helm charts | This repo, `deploy/vendor/charts/` | Vendored by hand (README there) |
| The git repo | A copy on the server: `ssh://git@<server>/home/git/alanfelez.git` | `alanfelez-git-sync.timer` fetches new commits from GitHub every minute with Argo CD's read-only deploy key; Argo CD reads the copy |
| DNS, OS updates, time | Shecan/Electro DNS, `mirror.arvancloud.ir`, `ntp.day.ir` | `/etc/systemd/resolved.conf.d/`, apt sources, timesyncd |
| HTTPS | Let's Encrypt (abroad: renewals need ~monthly access) | `letsencrypt` ClusterIssuer; production can use ArvanCloud CDN certificates instead |

Big binaries (k3s, Helm, kubeseal) are downloaded on a developer machine, checked against their published SHA-256 and
copied with `scp`. During a shutdown the site keeps running from the last deployed state; deploying new code then needs
images built inside Iran and a push to the server's git copy (not set up yet).

**The two servers (ArvanCloud, since 2026-10-19):** both Ubuntu 26.04 with k3s v1.36.5, ufw (only 22/80/443 open),
Traefik redirecting HTTP → HTTPS (`deploy/server/traefik-config.yaml` in `/var/lib/rancher/k3s/server/manifests/`), set up
with `deploy/server/bootstrap.sh` (REBUILD.md).

| | Production | Staging |
|---|---|---|
| Server | `188.121.120.201`, 4 CPU / 12 GB | `37.32.39.49`, 4 CPU / 8 GB (2 CPU / 4 GB was too small: k3s crash-looped) |
| Names | `alanfelez.ir` + `api.`/`auth.`/`admin.`; `www.alanfelez.ir`, `alanfelez.com`, `www.alanfelez.com` → 301 | `staging.alanfelez.ir` + `api.`/`auth.`/`admin.staging` |
| Shared password | none (removed 2026-10-27; staff sign-in protects the admin) | none (pages are noindex) |
| Mode | test mode until launch (LAUNCH.md §3) | test mode (demo data, mock gateway) |
| Updates | Publish to production (publish workflow) | every merge to `main` |

Both clusters share the Sealed Secrets key (the first server's, moved over) and Argo CD's read-only deploy key. Argo CD was
installed with `bootstrap.sh argocd <env>`; its UI has no public address: `ssh -L 8080:localhost:8080 root@<server>` then
`kubectl -n argocd port-forward svc/argocd-server 8080:80` on the server. Helper commands on each server: `alanfelez-otp`
(sign-in codes, there's no SMS provider yet), `alanfelez-keycloak-admin` (bootstrap admin to create the first staff user),
`/root/set-site-password.sh` (a shared password, if one is ever wanted again), `/root/set-registry-login.sh`.
