# Local setup (macOS · Linux · Windows)

> Goal: a clean machine to a running stack with **one command**. If a step here doesn't work, fix this doc in the same PR.
> Last verified: 2026-09-28 on macOS (Apple Silicon), Docker 28.

## 1. What you get

`task up` (or `docker compose up --build`) starts, **from scratch**:

| Service | URL (default ports) | Notes |
|---|---|---|
| **Website** (Next.js) | http://localhost:3000 (fa) · http://localhost:3000/en | SSR, data from the API, login via Keycloak |
| **Admin panel** (Refine) | http://localhost:5173 | Staff only (admin/editor/support + TOTP) |
| API (Go) | http://localhost:8080/v1/prices · `/v1/prices/stream` (live) · `/readyz` | Runs only after migrations + seed succeed |
| `worker` (Go, same image) | — | Background jobs (River). Locally: the **demo price generator** (a year of history on first start, then new prices every 15 s) |
| Keycloak | http://localhost:8081/realms/alanfelez/account (user login) · http://localhost:8081/admin (console, `admin`/`admin`) | Custom image: phone OTP + login theme |
| PostgreSQL | localhost:5432, db `alanfelez`, user/pass `alanfelez` | Keycloak has its own db `keycloak` |
| Redis | localhost:6379 | |
| `bootstrap` (one-shot) | — | `alanfelez bootstrap`: migrations, then seed profiles `reference,demo` |

Ports are bound to `127.0.0.1` only. `task smoke` checks the whole stack in a few seconds.

## 2. Prerequisites

| | macOS | Linux | Windows |
|---|---|---|---|
| Docker | [Docker Desktop](https://docs.docker.com/desktop/) or OrbStack | Docker Engine + Compose plugin (v2.24+) | **Docker Desktop with the WSL 2 backend** |
| Git | preinstalled / `brew install git` | distro package | inside WSL (`sudo apt install git`) |
| mise (toolchain) | `brew install mise` | `curl https://mise.run \| sh` | inside WSL: `curl https://mise.run \| sh` |

**Windows:** work **inside WSL 2** (Ubuntu). Clone the repo into the Linux filesystem (`~/src/alanfelez`, **not** `/mnt/c/...`),
then follow the Linux column. That gives correct file permissions, fast file watching and the same shell scripts as CI.
Native PowerShell works for `docker compose up --build`, but `task` commands and git hooks are only tested in WSL.

After installing mise, activate it in your shell once (`mise activate --help`), e.g. for zsh: `echo 'eval "$(mise activate zsh)"' >> ~/.zshrc`.

## 3. First run

```bash
git clone <repo-url> alanfelez && cd alanfelez
task setup        # mise installs pinned Go, Node, pnpm, Task, lefthook, sqlc, golangci-lint + git hooks
task up           # build images, start everything, run migrations + seed
task ps           # all services "healthy", bootstrap "exited (0)"
```

No `task`? Run `mise install` first (or use `docker compose up --build`: it needs nothing but Docker).

Check it works:

```bash
curl http://localhost:8080/v1/metals                                # Persian names
curl -H 'Accept-Language: en' http://localhost:8080/v1/plans        # plans + prices (Rial)
```

## 4. Try phone-OTP sign-up / login

1. Open http://localhost:8081/realms/alanfelez/account
2. Enter any Iranian mobile number, e.g. `09121234567` (Persian digits work too).
3. Get the code: **`task otp`** (the local "console" SMS sender writes it to the Keycloak log instead of sending an SMS).
4. Enter the code. A new account is created (username `09121234567`, attribute `phoneNumber=+989121234567`).

Test users (local only, file `deploy/local/keycloak/alanfelez-users-0.json`). Use them with **"Try another way" → password**:

| User | Password | Role | Note |
|---|---|---|---|
| `local-admin` | `local-admin-pass` | admin (staff) | Staff must set up **TOTP 2FA** on first login (scan with any authenticator app) |
| `local-editor` | `local-editor-pass` | editor (staff) | same |
| `09120000001` | `local-user-pass` | normal user | or log in with OTP |

**Try a purchase:** http://localhost:3000/plans → «انتخاب طلایی» → sign in as `09120000001` → accept the terms → pay. The **mock
gateway** page opens (served by the API, no real money): «پرداخت / Pay» or «انصراف / Cancel». You land on the result page; the
account page shows the plan, the billing history and, within 7 days and before using paid features, «درخواست بازگشت وجه».
Admins decide refunds under *Orders & refunds*. Renewal reminder SMS appear in `task logs -- worker`.

**Try the paid view:** sign in to the admin as `local-admin` → *Subscriptions* → paste the user's id (Keycloak console → Users →
`09120000001` → ID) → Silver or Gold. Then sign in on the website as that user: all series, longer chart ranges, live updates for all of them.
The admin also has *Prices & manual entry* (editor/admin), *Bulk entry (CSV)* with a preview before saving, the *Price review queue*
(automated prices that jumped past the threshold) and *Source health*. `support` can view them but not change anything.
**Try the content (M4):** admin → *Content → News & analysis* → «مطلب جدید» (editor/admin): write in the editor, pick a type
(news = public, analysis/forecast = Gold body), set the status to published, save. It appears at http://localhost:3000/analysis;
signed out or on Silver, an analysis shows only its teaser and the upgrade box. *FAQ*, *Static pages* (about, terms, privacy,
licenses) and *Site settings* (contact details, social links) work the same way. The FAQ is at http://localhost:3000/faq
(try the search and a link like `/faq#what-is-lme`). The demo profile seeds 8 sample articles (`config/seed/demo/20-articles.yaml`).
**Try support:** send the form at http://localhost:3000/contact, then open *Support → Contact messages* in the admin (menu badge).
Signed in on the website, open a ticket under *Account → Support*; answer it in the admin under *Support → Tickets* (support/admin).
The contact form allows 5 messages per hour per IP (Redis), so repeat tests may get «تعداد پیام‌ها زیاد است».
**Try the Gold features (M5):** as a Gold user (buy Gold with the mock gateway, or grant it in the admin): http://localhost:3000/auctions
(the demo profile seeds two IME sessions, `config/seed/demo/30-ime.yaml`; signed out you see only the summary),
http://localhost:3000/calculator (pick a product, change the weight; save, share), and *Account → SMS price alerts*: add
«تغییر روزانه بیش از ۰٫۵» on any product; within a minute the worker logs the SMS (`task logs -- worker`, console provider).
Staff add metal auctions under *Auctions* (title, metal, category, quantity, status; Gold fields and a PDF notice).
Lost the TOTP device for a local staff user? Remove it in the Keycloak console (Users → user → Credentials → delete OTP).

## 5. Daily commands

| Command | What it does |
|---|---|
| `task up` / `task down` | Start / stop (data kept) |
| `task reset` | **Delete all local data** and start fresh (asks first) |
| `task logs -- api` | Follow logs of one service (`keycloak`, `bootstrap`, …) |
| `task otp` | Show OTP codes sent in the last 15 min |
| `task smoke` | Smoke-test API, website and Keycloak |
| `task theme:dev` | Develop the login theme with hot reload and mock pages (no Keycloak needed) |
| `task seed` / `task seed -- --force` | Re-run seeding (only new rows; `--force` re-applies unchanged files) |
| `task api:run` | Run the API on the host (`go run`) against the compose databases |
| `task generate` | Regenerate code from `contracts/openapi.yaml` and SQL (commit the result) |
| `task api:reload` | Rebuild the Go binary and restart bootstrap, api and worker (fastest backend loop) |
| `task test` · `task test:integration` · `task lint` | Unit tests · integration tests against the compose Postgres (throwaway db per test) · linters |
| `task --list` | Everything else |

Editing things:
- **Go API / worker:** change code → `task api:reload` (or `task api:run` to run the API on the host).
- **Prices locally** come from the demo generator (`config/seed/demo/10-demo.yaml`). Staff can also enter prices by hand in the admin
  (single or CSV); a move over 15 % asks for confirmation. Free/anonymous visitors see the 7 base series only; grant yourself a plan in
  the admin (Subscriptions) to see everything.
- **Login theme** (`apps/keycloak-theme`, Keycloakify): `task theme:dev` for instant feedback with mock data
  (`?page=login-phone-otp.ftl&lang=en`), then `task up` to rebuild the Keycloak image.
- **Website / admin** (`apps/web`, `apps/admin`): `pnpm --filter @alanfelez/web dev` / `pnpm --filter @alanfelez/admin dev`
  against the compose API, or `task up` to rebuild the containers.
- **Keycloak extension** (`services/keycloak/extensions/`): `task up` rebuilds the image.
- **Realm file** (`services/keycloak/realm/`): it's only imported when the realm doesn't exist, so run `task reset`.
- **Seed data** (`config/seed/`): `task seed`. New rows are inserted and rows edited in the admin are left alone.

## 6. Configuration (`.env`)

Everything has a working default, so `.env` is optional. Copy `.env.example` to `.env` to override anything. Never commit `.env`.

**Ports already in use?** (other projects running) Set them in `.env`:
```dotenv
API_PORT=18080
KEYCLOAK_PORT=18081
POSTGRES_PORT=15432
REDIS_PORT=16379
```
Keycloak's public URL, the redirect URIs and the API's CORS/issuer settings follow these values automatically.

### Slow or restricted network

Large image pulls (Keycloak ≈ 450 MB, Go and Maven build images) can be slow from Iran, and some registries block Iranian IPs. Options:

1. **Registry mirror:** Docker Desktop → Settings → Docker Engine → add `"registry-mirrors": ["https://docker.arvancloud.ir"]`
   (or another mirror you trust), then restart Docker.
2. **Reuse images you already have and build artifacts on the host** instead of in Docker (needs Go + JDK 21 + Maven locally):
   ```dotenv
   # .env
   POSTGRES_IMAGE=postgres:16            # any cached version ≥ 16
   REDIS_IMAGE=redis:7-alpine
   KEYCLOAK_VERSION=26.3.0               # a Keycloak image you already have
   KC_EXTENSIONS_STAGE=extensions-prebuilt
   KC_THEME_STAGE=theme-prebuilt
   API_BUILD_STAGE=prebuilt
   API_RUNTIME_IMAGE=alpine:latest
   WEB_BUILD_STAGE=prebuilt
   ADMIN_BUILD_STAGE=prebuilt
   ```
   ```bash
   task build:local   # builds the API binary, Keycloak extension + theme jars, web and admin on the host
   task up
   ```
   CI and production always use the default, fully reproducible Docker builds.

## 7. Local Kubernetes (same flow as staging/production)

Runs the real delivery pipeline on your machine: **k3d (k3s) + Argo CD + Argo Rollouts + CloudNativePG**, with an in-cluster
Gitea as the git server, so the deploys are genuine GitOps (commit → Argo CD sync → bootstrap job → canary).
Needs **≥ 6 GB RAM for Docker** (Docker Desktop → Settings → Resources). Verified with 8 GB while other stacks were running too.

```bash
task k8s:up             # cluster + Gitea + Argo CD + root app (uses --context k3d-alanfelez, never your current context)
task k8s:deploy         # build images, import them, push a GitOps commit with the new tags
task k8s:status         # Argo CD apps, rollouts, pods
task k8s:deploy:broken  # deploy an API that can't reach Redis → canary never Ready → automatic abort (≈3 min)
task k8s:rollback       # revert to the previously deployed version (like the Rollback workflow)
task k8s:down           # delete the cluster
```

| URL | What |
|---|---|
| http://alanfelez.localhost:8088 | Website |
| http://admin.alanfelez.localhost:8088 | Admin panel |
| http://api.alanfelez.localhost:8088/v1/metals | API |
| http://auth.alanfelez.localhost:8088 | Keycloak |
| http://argocd.alanfelez.localhost:8088 | Argo CD UI (`admin` / `deploy/local/k8s.sh password`) |

`*.localhost` resolves to your machine in Chrome, Edge and Firefox. For curl, use `--resolve` or add the names to `/etc/hosts`.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `address already in use` | Another project uses the port → set `*_PORT` in `.env` (§6) |
| `api` never starts | `task logs -- bootstrap`: migrations or seed failed (the message says which file/row) |
| Keycloak unhealthy for > 2 min on first start | First start builds the server (slow on low-RAM machines). Give Docker ≥ 4 GB RAM. Check `task logs -- keycloak` |
| Login page is unstyled / old | Hard-reload the browser. Theme files are mounted, so check the path in `compose.yaml` |
| Realm changes not applied | The realm is imported only once → `task reset` |
| No OTP in `task otp` | Rate limits (5 codes/phone/hour). Wait, or `task reset` |
| Windows: slow, or line-ending errors | Work inside WSL 2 on the Linux filesystem (§2). The repo enforces LF via `.gitattributes` |
