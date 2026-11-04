# To-do

The one list of open work. **Keep it current:** whoever finishes, starts or discovers a job updates this file in the
same change (Claude: the `update-todo` skill). Newest decisions on top of each group; done items move to *Done* with
the date, and *Done* keeps only the last 30 days (git history has the rest).

Last updated: 2026-11-04 (privacy policy, «مواد اولیه معدنی», staff accounts from the admin)

## Now (in progress)
- [ ] **Privacy policy, «مواد اولیه معدنی» in the CMS texts, staff accounts → staging** (2026-11-04, branch
      `feat/privacy-staff`); then the main site after the client's check.
- [ ] **SMS by metal, greetings, article media** (2026-11-04): on staging; waiting for the client's check, then the main
      site, together with the next item.
- [ ] **Paid SMS metals, SMS limits, «مقالات», uploaded videos → staging** (2026-11-04, branch `feat/sms-checkout`).
- [ ] World prices of brass, iron and cast iron: **placeholder** points (migration 00028, made-up, 30 days) so the charts
      show; the client voids them in the admin and enters real prices.
- [ ] Client to test the idle sign-out on staging (1 hour untouched → «ورود دوباره» asks for the password or code).
- [ ] First run of the chat flow end to end: ship a small change (`ship/*`), then publish `v0.1.0` (ADR-0026).

## Next (no one else needed)
- [ ] Monitoring, part 2: `/metrics` in the Go API (per route; prices freshness, SMS, payments, sign-ups) with alerts
      (SourceStale, PaymentFailures, SmsBudget), user events (sign-up, checkout, payment, feature use) and a business
      dashboard; then GlitchTip, an outside uptime check, traces.
- [ ] Search: a `q` parameter on `/v1/articles` (and FAQ) so `/search` finds older articles too (today: newest 50).
- [ ] **Backups on the Barman Cloud Plugin** before CloudNativePG 1.31 (runs 1.30.1): 1.31 removes the built-in
      `barmanObjectStore` backups the data chart uses (warning seen 2026-10-28). Don't upgrade CNPG until then.
- [ ] SEO: Lighthouse check (icons and the share image are done).
- [ ] Windows without Ubuntu: `.gitattributes` (LF line endings) and test the setup on a real Windows machine.
- [ ] Deploys **during an internet shutdown**: build images inside Iran and push to the servers' git copies (DEPLOYMENT §8).

## Waiting on the owner
- [ ] **Video bucket** (ADR-0030, 2026-11-04): in ArvanCloud Object Storage, one private bucket per environment
      (e.g. `alanfelez-media-staging`, `alanfelez-media`) with CORS (PUT from the admin host, GET/HEAD from the web host),
      a key sealed as `alanfelez-media-s3` (ACCESS_KEY_ID, ACCESS_SECRET_KEY), and `storage: {endpoint, bucket}` in the
      environment's values. Until then the admin says video upload isn't set up (Aparat links still work).
- [ ] **sms.ir templates on production**: `ime_update=937878,welcome=207508,purchase_thanks=493390` added to
      `api.smsir.templates` in `deploy/environments/production/values.yaml` (staging has them). A ship branch may not
      touch production values, so this is a PR for the owner to approve.
- [ ] Client: the phone number and address, email info@alanfelez.ir, and the Telegram, WhatsApp, Bale and Eitaa links;
      entered in the admin's Settings (production), no code change. Instagram is set.
- [ ] Give the developer **GitHub write access**; check **claude.ai/code** works on their
      Claude account and can connect to the repo.
- [ ] **Save the Sealed Secrets key offline** (password manager): `bootstrap.sh backup-key` (REBUILD.md).
- [ ] Delete the **old server** `85.198.55.189` and the **old registry** `registry-808c2160fb…` (old ArvanCloud account).
- [ ] Wording of the **home page title/description** (SEO).
- [ ] **GitHub Pro** (or public repo) to enforce "pull requests only" on `main` (branch protection).

## Waiting on the client (docs/product/OPEN_QUESTIONS.md)
- [ ] **The client's SEO prompt** (said 2026-10-27 they'd give it once the site is complete): ask for it now.
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
- [ ] A penetration test by someone else.
- [ ] Google Search Console + Bing: verify the domain (DNS TXT), submit the sitemap.

## Done (last 30 days)
- 2026-11-04 Staff accounts from the admin («کارکنان», client and owner OK): create with a username and a temporary
  password (first sign-in: own password + TOTP), change the role (view only for sales, support, editor, admin), new
  temporary password, turn off (signs out). Through the API's Keycloak service account (now also query-users and
  view-realm); admin only, audited, never one's own account, never a customer. A new privacy policy written for the
  client (F19: usage records, paid SMS metals, greetings; migration 00037; a lawyer's review stays F8), and
  «مواد اولیه معدنی» in every page and FAQ text. Production got the sms.ir templates for the IME update, welcome and
  thanks; v0.32.0 published.
- 2026-11-04 Paid SMS metals (client, owner OK): 100,000 Toman per metal per month of the Gold plan, chosen on the
  checkout page with a live total; tied to the subscription (00035), never changed or refunded; more can be added
  during the plan at the full price of its length (`sms_addon` orders, `/v1/checkout/sms-metals`). Per-member daily SMS
  limit 50,000 Toman, both limits editable in the admin's Settings. «مقالات»: a free article type (00034, `/articles`,
  footer, sitemap). Article videos uploaded to ArvanCloud Object Storage (ADR-0030, 00036; on once the bucket exists).
  sms.ir templates for the IME update, welcome and thanks on staging.
- 2026-11-04 Gold SMS by metal (client, owner OK): several SMS metals instead of one main metal (migration 00031,
  `app.sms_metals`); three SMS: IME updated (sign-up metals and SMS metals), market updated and ±10 % alerts (SMS
  metals only); no 3-a-day cap (the daily budget stays); the old main metal is not carried over. A «choose your SMS
  metals» bar for 7 days after buying Gold.
  Welcome SMS once per mobile number ever (00032, hashed numbers) and a thank-you SMS per plan bought or granted. Articles: an
  uploaded picture (00033, Postgres like post images) and an Aparat video link shown as the picture with a play
  button (CSP frame-src Aparat only). Home page plans with the 1/3/12-month tabs; «مواد اولیه معدنی» everywhere (00030);
  «اخبار و تحلیل‌های بنیادی» instead of «فاندامنتال»; the admin SMS log shows the last 1000.
- 2026-11-03 Admin (client, owner OK by phone): a real **dashboard** for any day (visitors with the change on the day before,
  sign-ups, Silver/Gold held, plans ending in 7 days, what waits for staff, domestic prices not entered that day, which
  metals visitors viewed); **«رفتار کاربران»**: each signed-in user's days, time on the site, sections and metals for any
  date range (Jalali picker), a profile per user (metals, top products, sections, a bar per day, the pages of a chosen
  day, a hint for the sales staff) and Excel (CSV) exports, audited; **users** list filters (plan, sign-up metal,
  activity, province), paging and export; menu badges for members' analyses/comments and the price queue; a fold-out
  menu on phones. Website: `VisitBeacon` sends a view id and the seconds in view (only metal/price-row query keys).
  Migration 00029 (page views 1 year, daily summary 2 years, totals kept). All staff roles can read it.
- 2026-11-02 Where the calculator is off (main site), the CMS texts that name it are edited on the way to the page
  (`lib/hide-calculator.ts`: FAQ answers, About, Terms §7 dropped and renumbered); staging shows them whole.
- 2026-11-02 Bulk void per price row (admin price history: all prices, or a date range; audited once;
  `POST /v1/admin/series/{slug}/void`), e.g. for the placeholder world prices.
- 2026-11-02 Home: the world prices block and the world chart tabs list all seven metals («قیمت جهانی به‌زودی» /
  «به‌زودی» until a metal's world price is entered in the admin).
- 2026-11-02 Members' analyses wait for review in the admin («تحلیل کاربران» → «در انتظار تأیید», publish/reject) and
  their author sees them marked pending; star ratings (1–5) and comments on members' analyses (Silver, Gold, staff) and
  on the experts' articles (by the article's own plan: analyses Gold); members' comments are reviewed too (admin tab
  «نظرها»), staff comments go live at once under «الان‌فلز». Migration 00027, `/v1/discussions/*`, `/v1/admin/comments`.
- 2026-11-02 Home and About (client): hero chart with all seven metals («به‌زودی» until a metal has a world price), each in
  its own colour, sliding in with a progress bar; world-chart tabs with separators and a bold active metal; plans by
  tier (visitors/free: three cards; Silver: what Gold adds with the upgrade button; Gold: nothing); the strategy map on
  /about (wording: Alan Felez informs and later introduces buyers and sellers, never a party to a trade); a glowing
  «تحلیل خودت را بگذار» button that free visitors see too (it points to the plans).
- 2026-11-02 Calculator hidden on the main site, kept on staging (`FEATURE_CALCULATOR`, web.extraEnv in staging/local):
  no menu/footer link, no page (404), no plan row, no «چرا الان‌فلز؟» card, no FAQ category. «چرا الان‌فلز؟» in plan
  order (2 free, 2 Silver, then Gold). Compare chart's third colour pink instead of violet.
- 2026-11-02 All seven metals everywhere, in the client's order (آلومینیوم، مس، روی، سرب، برنج، چدن، آهن; migration 00026):
  the prices page, chart picker (a metal without prices is listed, disabled), calculator (works with a typed price) and
  auctions filter list every metal, not only those with prices.
- 2026-11-01 Sign-up form (client, owner OK): the sign-in details (phone, password, repeat) in their own box, «مشخصات شما»
  under a gold divider; full name (no longer "or company") and a separate optional company name; «توزیع و پخش» no
  longer offered; at least one specialty metal required (tick boxes); password minimum 4 (was 10), set on running
  realms by the keycloak-profile job. The company name reaches the admin users list (token mapper `company` →
  `app.users.company`, migration 00025).
- 2026-11-01 Prices page (client): product groups as boxes inside a metal's category (`market.product_groups`, migration
  00024 with «آلومینیوم نرم»/«آلومینیوم خشک»; admin: add/rename/reorder/delete, a group menu per product); the three
  filters numbered one under the other (metal → category → market); the Toman/Rial and kg/ton switch removed; the ticker
  says which market (بورس کالا / جهانی) and unit each price is.
- 2026-11-01 Old sample products retired (migration 00023, owner OK): «آلومینیوم نرم», «مس کابلی قرمز», «شمش آلومینیوم» in
  intermediate; «مس کابلی», «ضایعات برنج», «ورق ۴ آهن» and the day-price rows of «برنج زرد», «میلگرد ۱۶», «ضایعات چدن»
  deleted with their history (those three now only carry the world price, named برنج, آهن, چدن).
- 2026-11-01 The client's product list (85 products, 7 metals, each with a «بازار» Toman/kg row) loaded from
  `config/seed/reference/45-product-list.yaml`; a row shows on the site (prices, metal page, charts, calculator)
  once it has its first price, so new products and metals from the admin appear by themselves.
- 2026-11-01 Product list per metal in the admin («فلزات و محصولات», client): pick a metal, add a product in one step
  (its «بازار» Toman/kg row is created with it, id made automatically), rename a metal or product, move a product to
  another category, delete one that has no prices yet (otherwise deactivate). New endpoints PUT/DELETE
  `/v1/admin/metals/{slug}`, `/v1/admin/products/{slug}`, DELETE `/v1/admin/series/{slug}`, all audited.
- 2026-11-01 Logo (client): no dark square, larger on phones (the language switch moved into the phone menu), and
  sharp at any size: `components/Logo.tsx` draws the mark as vector shapes traced from docs/design/brand/logo-alanfelez.png
  (the only file, 215 px) and the name as text in Vazirmatn. Replace with the designer's vector file when it comes (F3).
- 2026-11-01 Calculator (client): weight, price and shipping are grouped with commas as they're typed (3,000,000).
- 2026-10-31 **Production outage 07:56–10:19 UTC found:** not monitoring. cloud-init's network hotplug handler re-ran
  DHCP on eth0 for each pod's virtual device (23,979 times since 2026-10-18); one renewal failed and the server lost its
  IP. Turned off on staging; `bootstrap.sh base` now turns it off on new servers. Production: owner runs the same.
- 2026-10-31 Monitoring **turned off on production** too: the production server stopped answering (no ping, no SSH)
  after it ran for two days; staging had failed the same way. Back only after the cause is found in the server's
  logs and with lighter settings (deploy/observability stays in git; the Argo CD apps are removed).
- 2026-10-31 Idle sign-out is 3 hours on staging and production (client; was 1 hour).
- 2026-10-31 Auctions page (client): «… روز مانده» / «آخرین روز» on open auctions (Gold), a count per status,
  only metals with auctions, one-line filters on phones, a short lock banner for free users, and Gold details folded
  behind «جزئیات بیشتر» on phones. Counts come from the latest 100 auctions (enough for now).
- 2026-10-31 «گزارش» on members' analyses (client): Silver and Gold flag someone else's post once (migration 00022);
  the admin lists reported posts first with a count and a «گزارش‌شده» filter.
- 2026-10-30 Members' analyses («تحلیل کاربران», client + owner, ADR-0028): Silver and Gold post and read them (title,
  text, metal, view, one chart image re-encoded into Postgres), with the team's analyses newest first, blue «تحلیل توسط
  <name>» vs gold for the team; 3 a day, promises refused, staff hide in the admin (audited), disclaimers on the page.
- 2026-10-30 Article keywords (client): a «کلمات کلیدی» field in the admin (migration 00020, `keywords` in the API),
  shown as #tags under a locked title instead of the summary (metal, category and type when empty); locked news says
  «ویژه‌ی مشترکان نقره‌ای و طلایی». Demo articles now follow their seed file (upsert) and carry keywords.
- 2026-10-30 Fundamental news is Silver (client + owner): `news.read` → Silver in the tier matrix; Free sees news and
  analysis titles only (no summary or outlook on locked cards and pages, nor in search); plan table row «اخبار فاندامنتال»,
  «تحلیل تکنیکال» for Gold.
- 2026-10-30 «پیش‌بینی و تحلیل» (client): tabs «همه / تحلیل‌های تکنیکال / اخبار فاندامنتال», analyses before news,
  «تحلیل توسط تحلیل‌گران الان‌فلز» on analyses, filters only for metals/topics with articles (one scrolling line on
  phones), no empty cover, market indicators with their own market and unit and locked for free users, phone sidebar
  after the articles; article page: related articles, share buttons, larger back link. More demo news and analyses.
- 2026-10-30 Signed out after 1 hour without activity on staging and production (client + owner): Keycloak `ssoSessionIdleTimeout`
  3600 s (was 7 days), applied to the running realm by the profile job; the 2-device limit stays.
- 2026-10-30 Monitoring removed from **staging** (sign-in broke there: its 8 GB server ran short of memory); production
  keeps it. Staging is for checking changes, the server watched is production.
- 2026-10-29 Staging rollouts wait 10 min (was 3) for new pods: a brief DNS failure while pulling the image aborted
  one (2026-10-28; the owner retried it). If it happens again: `kubectl argo rollouts -n alanfelez retry rollout alanfelez-web`.
- 2026-10-29 Header (client): the name and plan badge open an account menu (account, plan & renewal, tickets, log out);
  a reminder under the header when a paid plan ends within 7 days with no renewal queued, × hides it until the next
  sign-in (session cookie the login and logout actions delete). Search: suggestions while typing (`/api/search`), the
  search button kept, and when nothing matches exactly the closest names are shown as «شاید منظورتان…» (typos).
- 2026-10-29 **Monitoring** (ADR-0015) on staging and production: Grafana at `<admin host>/grafana` with Keycloak sign-in,
  dashboard «Alan Felez» (site, traffic/errors, deploys, server, database/backups, logs/events), Prometheus (30 d), Loki +
  Alloy (pod logs and Kubernetes events, 30 d), blackbox checks, alert rules → Bale (OPERATIONS §1).
- 2026-10-28 Header (client): stays at the top while scrolling and slims down; the plan badge (رایگان/نقره‌ای/طلایی)
  next to the user's name, «ارتقا» for free users; a magnifier opening `/search` (products, metals, analyses, FAQ
  questions, pages; read anonymously, noindex). Articles: the newest 50 only, since `/v1/articles` has no text search.
- 2026-10-28 The archived IME offerings are dropped (00019), after production's first backup (15:12 UTC) held them.
- 2026-10-28 Header shows the page you're on (client): bold, white, gold underline in the desktop menu (the phone menu
  and bottom bar already did). Chart page on phones (client): metal and category side by side, high/low/average under
  the chart so it starts higher, range buttons 40 px tall, the four compare cards behind «نمایش نمودارهای مقایسه»
  (remembered for the tab). Desktop unchanged.
- 2026-10-28 Free plan charts world prices only (client chose option B, owner OK'd): IME and market history need Silver
  (`chart.full`, ListSeriesPoints), so free users can't rebuild day-by-day domestic prices. The chart page opens on a
  world price for them, marks the rest «ویژه‌ی نقره‌ای» and says the history (not the price) is locked.
- 2026-10-28 An ended sign-in (Keycloak session over, e.g. another device took its place under the 2-device limit)
  kept the user's name in the header while every page showed guest data (a Gold user saw locked history). The header
  now offers «ورود دوباره» with a notice. Checked the API tier matrix for free/silver/gold: all correct.
- 2026-10-28 Chart compare: comparing world and IME prices is free; the other products are offered too, marked
  «ویژه‌ی نقره‌ای», and show as 🔒 (no line, link to /plans), with a line under the chart saying so (client).
- 2026-10-28 Chart page «مقایسه‌ی کالاها» (client): the side panel's four products on one chart as % change over the
  range (?view=compare), colored chips with each one's change, remove (×) and «+ افزودن کالا», a crosshair with every
  product's change. The four small charts on the side stay and drive the same selection.
- 2026-10-28 Chart page: the «تحلیل پیشرفته بازار» box promised technical analysis and AI that don't exist; it is
  replaced by «تحلیل‌های {metal}» (the 3 newest analyses of that metal, hidden when none). The product picker lists the
  products a plan doesn't include («ویژه‌ی نقره‌ای»), and picking one shows it locked instead of another product.
- 2026-10-28 Prices page, second pass (client approved all five): phone layout (filters are one sideways-scrolling
  line each, the units switch moves under the list; first price at 431 px instead of 596 on a 375 px phone); "last
  updated" says «دیروز ۱۲:۱۷» or the date when a price isn't today's; rows and phone cards open the chart (chart icon);
  product search (ی/ي and ک/ك match) and a sort by daily change (dropdown, and the column header on desktop).
- 2026-10-28 Database backups on **production**. Restore drill on staging passed: last night's backup restored into a
  temporary cluster, row counts identical (users, orders, subscriptions, 377,492 price points, audit log, Keycloak users).
- 2026-10-28 The price source shown everywhere is the market (one of the three), never the feed name such as the demo
  «داده‌ی نمایشی»; «منابع داده» on /prices lists all three, «قیمت جهانی» included.
- 2026-10-28 Three price sources (client; owner OK'd by phone): «بورس کالای ایران», «بازار», «قیمت جهانی».
  Migration 00018 moves LME series into «قیمت جهانی» and Iran Iron Market series into «بازار» (history stays with the
  series; slugs unchanged) and removes the two empty markets; the reference seed matches.
- 2026-10-28 Prices page review (client approved all): the unit column says the full unit («تومان/کیلوگرم», «دلار/تن»)
  instead of a fixed «تومان/kg» header; a market filter; the products a plan doesn't include are listed as 🔒 rows (name,
  market, unit; `PriceList.lockedSeries`, never a price; at most 10, the line below counts all); a Toman/Rial and
  per-kg/per-ton switch for Iran prices (?cur=rial, ?per=ton; SCOPE §14).
- 2026-10-27 Auction cards: «ارتقا برای مشاهده‌ی جزئیات» for non-Gold (home and /auctions); the home preview is compact
  and Gold readers get «مشاهده‌ی جزئیات», a link to that card on /auctions.
- 2026-10-27 Four demo auctions in the `demo` seed (config/seed/demo/30-auctions.yaml, «(نمونه)» in the title) so the
  home and /auctions show them on staging and test-mode production; the client deletes them in the admin.
- 2026-10-27 Home: links «قیمت … امروز» to each metal's page under the live prices, and «تازه‌ترین تحلیل‌ها» (3 newest
  analyses/forecasts, same card as /analysis) after the auctions.
- 2026-10-27 The client: `alanfelez.ir` had no email or website before the DNS move (alanfelez.com is ours too).
- 2026-10-27 Production sends the reminder and Gold price SMS through sms.ir (the client checked all four on staging).
- 2026-10-27 A price page per metal for search engines: /prices/copper «قیمت مس امروز» (title, description, canonical,
  breadcrumbs JSON-LD, in the sitemap); same look as /prices, whose metal tabs now link there (old ?metal= links redirect).
- 2026-10-27 Price SMS: a product whose ±10 % alert went out isn't counted again in «قیمت‌ها به‌روزرسانی شد»; no
  other change = no second SMS (client chose option B). Released v0.14.0 (flags screen, Gold price SMS, SMS log, icons).
- 2026-10-27 **Delete a user** from the admin users list (admin only, confirm, audited): Keycloak account and sessions
  deleted through the API's service account `alanfelez-api-admin` (manage-users + view-users only, created by the
  keycloak-profile job from the sealed `alanfelez-keycloak-api-admin`); personal details and the user's own data removed,
  orders/payments/tickets kept without a name (00017). Staff and self refused.
- 2026-10-27 Database backups on **staging**: ArvanCloud Object Storage bucket `alanfelez-backups` (owner), keys sealed
  with `seal-backup-keys.sh` for both clusters, WAL archiving + nightly backup on.
- 2026-10-27 Sign-up answers (activity, metals, province) in the admin users list: web-client token mappers (added to running
  realms by the keycloak-profile job), `app.users` columns (00016), `AdminUser` fields. Device limit: 2 signed-in devices
  per account, the oldest is signed out (all accounts, owner OK). The unused IME offerings left the app (00015 moves the
  table and its rows to the `archive` schema). Backups: `deploy/server/seal-backup-keys.sh` for the bucket keys.
- 2026-10-27 Admin «پیامک‌های ارسال‌شده» (SMS log: sent/failed and sms.ir's reason); the SMS settings show the number
  SMS go to, or warn that the account has none. Footer icons: Instagram, Telegram, WhatsApp (new setting), Bale, Eitaa,
  LinkedIn and email; each shows once its link is set in the admin.
- 2026-10-27 Admin «قابلیت‌ها» (feature flags): payments, English site, licences page; admin only, audited. Payments
  can't be switched on while the test gateway is in use.
- 2026-10-27 Gold price SMS (owner OK'd): the user picks a main metal (payment result page, account); «قیمت‌ها
  به‌روزرسانی شد» per batch of domestic/IME changes (15 min quiet, ≤ 3/day, none 22–08) and an alert on ±10 % against
  the previous day (once per product and day). The manual alerts UI is gone (their rows and API stay unused).
- 2026-10-27 SMS from the API/worker through sms.ir (verify templates; same key as the OTP): renewal reminders 7, 3, 1 days
  before and on the day a plan ends (owner OK'd), price alerts as one template. Off until the template ids are set.
- 2026-10-27 Admin «آمار بازدید»: daily unique visitors, signed-in users and page views (30 days), and the signed-in
  visitors of a day by name, mobile and plan. Cookieless: anonymous visitors are a one-way daily id (no IP stored),
  robots ignored, 90-day retention in the nightly cleanup (migration 00012).
- 2026-10-27 admin.alanfelez.ir no longer asks for the shared password; staff sign-in protects it. At launch: TOTP for
  every staff account (or an IP allowlist for the admin).
- 2026-10-27 Content review (client): terms gain subscription/renewal/refund rules and lose the marketplace leftovers,
  brand «الان‌فلز»; privacy covers the sign-up form, password login and the visitor count; about and FAQ follow the plan
  table and the metal auctions; new FAQ «بازگشت وجه». Migration 00011 (old text kept as page revisions).
- 2026-10-27 Footer in four columns: about + social icons, quick links, company links, contact (phone, e-mail, address,
  hours from the admin's Settings, each only when set; the contact form always), the eNamad seal; bottom bar with the
  Jalali year (automatic), terms, privacy and «صرفاً جهت اطلاع». Released v0.12.0 before it (metal auctions, closing CTA).
- 2026-10-26 Home: closing call to action «بازار را قبل از معامله بشناسید» after the latest auctions (sign-up / plans).
- 2026-10-26 Metal auctions («مزایدات», SCOPE §7) replace the IME offerings page: admin CRUD with status and a PDF notice
  (in Postgres, ADR-0027), site page with filters, Gold-only deadline/place/organiser/details/PDF, home «تازه‌ترین مزایدات».
- 2026-10-26 Home: «چرا الان‌فلز؟» after the plans: the client's subtitle, 7 benefits (each links to its page and shows
  its plan) and «شروع رایگان» for signed-out visitors. Released v0.10.0 before it (plan table, «ورود» = password page).
- 2026-10-26 Sign-up form: the verified mobile number is shown as the username («نام کاربری (شماره موبایل)»).
- 2026-10-26 Released v0.9.0: home plan cards, full sign-up form after the SMS code, clearer charts.
- 2026-10-26 «ورود» opens the username + password page (username = mobile number, Persian digits accepted); «امتحان
  روش‌های دیگر» there is the SMS code, «ثبت‌نام» still starts with the SMS code. Forgot password: number → code → the
  username shown read-only + new password and repeat. Owner and client OK'd; no realm change.
- 2026-10-26 The client's plan table (owner OK'd by phone): Free = global and IME prices and charts; the domestic day
  prices (free market, Iran iron market) are Silver and Gold (migration 00009; new series are free only in global
  markets and on the IME). Discounts −5 % / −15 % (versioned prices). Plan cards list the table's rows. Closes F2, F6.
- 2026-10-26 Home: the plan cards after the global chart (same component as /plans); cards list every feature, the missing ones greyed out.
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
