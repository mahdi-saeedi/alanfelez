# To-do

The one list of open work. **Keep it current:** whoever finishes, starts or discovers a job updates this file in the
same change (Claude: the `update-todo` skill). Newest decisions on top of each group; done items move to *Done* with
the date, and *Done* keeps only the last 30 days (git history has the rest).

Last updated: 2026-10-26 (full sign-up form on staging)

## Now (in progress)
- [ ] First run of the chat flow end to end: ship a small change (`ship/*`), then publish `v0.1.0` (ADR-0026).

## Next (no one else needed)
- [ ] Admin screen for **feature flags** (payments, English site, licences page are DB-only today; needed before launch).
- [ ] **Limit on simultaneous devices** for paid accounts (SECURITY §5, the last open security item).
- [ ] SEO: Lighthouse check (icons and the share image are done).
- [ ] Windows without Ubuntu: `.gitattributes` (LF line endings) and test the setup on a real Windows machine.
- [ ] Deploys **during an internet shutdown**: build images inside Iran and push to the servers' git copies (DEPLOYMENT §8).

## Waiting on the owner
- [ ] Give the developer **GitHub write access**; check **claude.ai/code** works on their
      Claude account and can connect to the repo.
- [ ] **Save the Sealed Secrets key offline** (password manager): `bootstrap.sh backup-key` (REBUILD.md).
- [ ] **ArvanCloud Object Storage bucket** + `alanfelez-backup-s3` secret → database backups on for production and
      staging. Until then a lost server loses user data.
- [ ] Delete the **old server** `85.198.55.189` and the **old registry** `registry-808c2160fb…` (old ArvanCloud account).
- [ ] Wording of the **home page title/description** (SEO).
- [ ] **Per-metal price pages** («قیمت مس امروز», good for Google): the client isn't sure yet (2026-10-25). Suggest it
  again when they ask "what else can we do?".
- [ ] **GitHub Pro** (or public repo) to enforce "pull requests only" on `main` (branch protection).
- [ ] Ask the client whether `alanfelez.ir` had **email or a website** before the DNS move (records not copied are gone).

## Waiting on the client (docs/product/OPEN_QUESTIONS.md)
- [ ] **A source for the global prices** (all 7 metals; iron, brass, cast iron sit in «بازار جهانی», migration 00008,
  entered by hand for now): the client will send the sources. Ask them again; then see whether it can be automatic.
- [ ] **F13 payment gateway** (merchant id, sandbox, production keys).
- [ ] **F7 SMS provider** (account, sender number, approved templates). Sign-up needs it.
- [ ] F11 scope sign-off · F8 legal review (terms, privacy, refunds) · F14 content edits · F4 English review.
- [ ] F3 vector logo · F5 price sources · F16 IME data · F12 product list.

## Before launch (docs/guides/LAUNCH.md)
- [ ] Switch production out of test mode (LAUNCH §3): `env: production`, real providers, `seedProfiles: reference`,
      `indexable: true`, `consoleAllowed: false`.
- [ ] **New production secrets** (`bootstrap.sh reseal` on the production server); today it shares staging's.
      Include `alanfelez-sms` (sms.ir key), copied from staging on 2026-10-24.
- [ ] Postgres: second instance and storage size plan; Keycloak 2 replicas.
- [ ] First staff accounts on production (with TOTP); disable the Keycloak bootstrap admin. **First** give the
      keycloak-profile job its own service account (it logs in with the bootstrap admin today), or sign-up field
      changes silently stop reaching Keycloak.
- [ ] Monitoring and alerts; restore drill; a penetration test by someone else.
- [ ] Google Search Console + Bing: verify the domain (DNS TXT), submit the sitemap.

## Done (last 30 days)
- 2026-10-26 Full sign-up form after the SMS code (client, 2026-10-25), on staging; the user profile is applied by a
  PreSync job before each deploy.
- 2026-10-26 Charts drawn at real size (readable on phones, taller there), round gridline values, the latest price marked, page scroll works over charts on touch, tooltip kept inside.
- 2026-10-26 Home: «نمودار قیمت جهانی فلزات» section under the global prices, a full 1-month chart per metal in turn (8 s, tabs, pauses on hover).
- 2026-10-26 Released v0.8.0: global prices free (7 metals), home global block and rotating chart card, chart page picker and compare panel, forgot password by SMS (owner tested on staging).
- 2026-10-25 Global prices for all 7 metals: «بازار جهانی» market with rebar, yellow brass and cast-iron scrap in USD/ton
  (free, like LME; any new series in a global market is free). Home shows all 7. Chart page picker: metal → category
  (قیمت جهانی، محصولات میانی، ضایعات، مواد اولیه) → product; global charts in $/ton, the others Toman/kg by default.
- 2026-10-25 Home hero card: the global prices' 1-month charts in turn (every 6 s, pauses on hover, none with reduced
  motion). Chart page: product list grouped «فلز · دسته», and a side panel comparing up to 4 charts (c1–c4 in the URL).
- 2026-10-25 Home page «قیمت لحظه‌ای فلزات» block shows the global (LME) prices only (client); the hero card stays on domestic copper.
- 2026-10-25 Global (LME) prices are free for everyone (client's written OK in the chat, owner asked for it): migration
  00007, and new LME series added in the admin are free too. Global series exist for copper, aluminum, zinc and lead;
  iron, cast iron and brass have none yet (the client knows a source: add them in the admin, market LME).
- 2026-10-25 «فراموشی رمز عبور» by SMS code (owner OK): password page link → phone → code (same 5/hour limit) → new password. Existing accounts only. On staging first; the owner tests it with his number before publishing.
- 2026-10-25 Production: the demo price generator is off (owner OK), so prices entered in the admin stay; the owner made the client's production staff account.
- 2026-10-25 Site icons (favicon from the logo's mark, app icons from the whole logo) and a 1200×630 share picture per
  language for Telegram/WhatsApp previews, on every page. Failed sign-ins land on a Persian/English page
  (`/auth-error`) instead of Auth.js's English "Server error".
- 2026-10-24 Sign-in codes stay valid 5 minutes (was 2), since SMS can take a minute; a new code after 120 s as before.
- 2026-10-24 Fixed the sign-in code limit (5 per phone per hour) never resetting: updating the counter dropped its
  one-hour expiry. On production after the next publish.
- 2026-10-24 Sign-in codes: the connection to sms.ir is opened while the user types the number, and the code page no
  longer waits for a slow send (at most 2.5 s). Codes still took 30–60 s to reach phones: the client asked sms.ir support.
- 2026-10-24 Production (alanfelez.ir) sends sign-in codes by real SMS through sms.ir, like staging.
- 2026-10-24 Staging sends sign-in codes by real SMS (sms.ir verify, template 972517); key sealed in `alanfelez-sms`.
  `OTP_SMS_PROVIDER` now overrides the realm's stored provider (the realm import had frozen "console").
- 2026-10-24 Keycloak 26.8.1: its image ships the fixed `ca-certificates` (CVE-2026-114406, CRITICAL), which had
  blocked every Release (and so staging) since 2026-10-23.
- 2026-10-24 eNamad seal in the footer and on the licenses page (id 8262525, set by migration 00006, editable in
  admin → Site settings). It loads on its own and stays hidden unless eNamad's image actually loads. eNamad only
  verifies it on alanfelez.ir, so the check happens after publishing to production.
- 2026-10-23 Next.js 16.3.6 → 16.4.1 (two critical RCE advisories, GHSA-2464-fhr4-w9xw and GHSA-673q-mjm6-r5xr, blocked the release scan).
- 2026-10-23 Back-dated price entry: a Jalali date + Tehran time picker in the admin (single and table entry, with
  "price on that date" from `GET /v1/admin/prices/at`). A back-dated quote goes into history and the charts, is gated
  against the price around that time, and never moves the latest price or sends SMS. Staging demo prices turned off.
- 2026-10-23 Price management in the admin: search/metal filter, phone cards, table entry (check, then save),
  per-row history (who, when, from → to) with **void** for a wrong price (kept as rejected; the previous price
  becomes the latest again), and a «فلزات و محصولات» page to add metals/products/price rows and deactivate them.
  Persian guide: `docs/guides/PRICE_ADMIN.fa.md`.
- 2026-10-23 Released v0.3.0 to production: metal icons with chemical symbols on the home cards and the price table.
- 2026-10-21 Go 1.27.3 (GO-2026-6809, crypto/x509; govulncheck failed every change until then).
- 2026-10-20 Released v0.1.0 to production: larger header logo, header fits on phones.
- 2026-10-20 Ship and publish from the chat without GitHub (ADR-0026): `ship/*` branches merge when CI is green and deploy
  staging; `publish/production` promotes staging's images as `vX.Y.Z`; `rollback/*` branches roll back.
- 2026-10-19 GitHub Actions may open pull requests (releases can propose production); staging has no shared password.
- 2026-10-19 Developer guide rewritten for the browser-only flow (claude.ai/code → PR → staging → release), as a web page
  and a Google Doc; `ONBOARDING.md`, the `release-to-production` recipe, and "people merge, Claude doesn't" in CLAUDE.md.
- 2026-10-19 Staging live on `37.32.39.49` (staging.alanfelez.ir, password on site and admin), resized to 4 CPU / 8 GB:
  at 2 CPU / 4 GB k3s kept crashing under load (CPU steal + memory). Every merge to main now deploys there.
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
