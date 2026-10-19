# To-do

The one list of open work. **Keep it current:** whoever finishes, starts or discovers a job updates this file in the
same change (Claude: the `update-todo` skill). Newest decisions on top of each group; done items move to *Done* with
the date, and *Done* keeps only the last 30 days (git history has the rest).

Last updated: 2026-10-19

## Now (in progress)
- [ ] **Staging server** (`37.32.39.49`, staging.alanfelez.ir): registry login (owner types it:
      `ssh -t root@37.32.39.49 /root/set-registry-login.sh`), then `bootstrap.sh argocd staging`, then check every page.
- [ ] **Developer guide**: rewrite for the browser-only flow (claude.ai/code → pull request → staging → release),
      publish it as a Google Doc for the new developer; update `ONBOARDING.md` to match.

## Next (no one else needed)
- [ ] Claude recipe **release-to-production** (tag `vX.Y.Z` → release PR → merge) and a short project overview for Claude.
- [ ] Admin screen for **feature flags** (payments, English site, licences page are DB-only today; needed before launch).
- [ ] **Limit on simultaneous devices** for paid accounts (SECURITY §5, the last open security item).
- [ ] Persian/English **sign-in error page** instead of Auth.js's English "Server error".
- [ ] SEO quick wins: **favicon + app icons**, a **default share image** (Telegram/WhatsApp previews), Lighthouse check.
- [ ] Windows without Ubuntu: `.gitattributes` (LF line endings) and test the setup on a real Windows machine.
- [ ] Deploys **during an internet shutdown**: build images inside Iran and push to the servers' git copies (DEPLOYMENT §8).

## Waiting on the owner
- [ ] **Save the Sealed Secrets key offline** (password manager): `bootstrap.sh backup-key` (REBUILD.md).
- [ ] **ArvanCloud Object Storage bucket** + `alanfelez-backup-s3` secret → database backups on for production and
      staging. Until then a lost server loses user data.
- [ ] Resize the **staging server** to 4 CPU / 8 GB (now 2 CPU / 4 GB, one pod each for API and website).
- [ ] Delete the **old server** `85.198.55.189` and the **old registry** `registry-808c2160fb…` (old ArvanCloud account).
- [ ] Wording of the **home page title/description** (SEO), and whether to build **per-metal price pages** («قیمت مس امروز»).
- [ ] **GitHub Pro** (or public repo) to enforce "pull requests only" on `main` (branch protection).
- [ ] Ask the client whether `alanfelez.ir` had **email or a website** before the DNS move (records not copied are gone).

## Waiting on the client (docs/product/OPEN_QUESTIONS.md)
- [ ] **F13 payment gateway** (merchant id, sandbox, production keys).
- [ ] **F7 SMS provider** (account, sender number, approved templates). Sign-up needs it.
- [ ] F11 scope sign-off · F8 legal review (terms, privacy, refunds) · F14 content edits · F4 English review.
- [ ] F3 vector logo · F5 price sources · F16 IME data · F12 product list.

## Before launch (docs/guides/LAUNCH.md)
- [ ] Switch production out of test mode (LAUNCH §3): `env: production`, real providers, `seedProfiles: reference`,
      `indexable: true`, `consoleAllowed: false`.
- [ ] **New production secrets** (`bootstrap.sh reseal` on the production server); today it shares staging's.
- [ ] Postgres: second instance and storage size plan; Keycloak 2 replicas.
- [ ] First staff accounts on production (with TOTP); disable the Keycloak bootstrap admin.
- [ ] Monitoring and alerts; restore drill; a penetration test by someone else.
- [ ] Google Search Console + Bing: verify the domain (DNS TXT), submit the sitemap.

## Done (last 30 days)
- 2026-10-19 Two environments: production on `188.121.120.201` (alanfelez.ir, test mode until launch), staging
  on `37.32.39.49`; live switch without downtime.
- 2026-10-19 `deploy/server/bootstrap.sh` + `REBUILD.md`: everything rebuildable from GitHub in about an hour.
- 2026-10-19 Developer guide (Persian RTL + English) published as a page.
- 2026-10-18 Moved to the new ArvanCloud account and server; alanfelez.com and www redirect to alanfelez.ir;
  website public, admin password-protected.
- 2026-10-18 Security updates: kin-openapi v0.151.0; earlier Go 1.27.2 and Keycloak 26.8.0.
- 2026-10-13 First staging online; registry mirror, vendored charts and in-Iran git copy (servers work without the
  international internet).
- 2026-10-12 Sign-up name step («تکمیل ثبت‌نام»); fixed "Server error" when signing in from another host name.
