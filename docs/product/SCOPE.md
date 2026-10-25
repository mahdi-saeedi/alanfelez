# Product Scope — v1

> **This is the primary spec.** Based on the client's answers of 2026-09-28 ([`client/questions-round1-answered.docx`](../client/questions-round1-answered.docx),
> summarized in [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md)).
> Tags: ✅ **Client** = the client decided. 🛠 **Dev proposal** = the client said "you decide", so this is our decision.
> The client said he'll correct things later, so every 🛠 item should be shown to him on staging.

## 1. Sources of truth (client answer #1)

- **Content and features:** the client's Word files, one per section: `FAQ.docx`, `درباره ما.docx`, `قوانین.docx`
  (text copies in [`content/`](../content/)). If they conflict with the Figma design, **the Word files win**.
- **Look and feel:** the Figma design. Visual style, layout, components and colors.
  ⚠️ The client says the latest design is at the link he sent, but https://ratio-donkey-94517275.figma.site/ still serves
  the older build (checked 2026-09-28). Until he sends the new link, use the newest screenshots in
  [`screenshots/summary-draft/`](../design/screenshots/summary-draft/) for navigation and page structure (follow-up F1).

## 2. Brand (client answer #7)

- Name: **«الان‌فلز»** (Latin: **Alan Felez**). ⚠️ **Not «آلان‌فلز».** The design and prototype use the old spelling, so replace it everywhere.
- Logo: [`brand/logo-alanfelez.png`](../design/brand/logo-alanfelez.png). It's only 215×215 raster, so we need a vector/high-res version (follow-up F3).
  The logo is blue/teal on dark with an upward-arrow mark. The site gold (`#C9A227`) stays as the UI accent unless the client says otherwise.
- Domains: **alanfelez.ir** and **alanfelez.com**, both owned. 🛠 `alanfelez.ir` is primary (Iranian server, local SEO, local gateways).
  `alanfelez.com` redirects with a 301. For English, use `alanfelez.ir/en` (or point `.com` at `/en`, to decide at launch).

## 3. Languages (client answer #24) ✅

**Persian (default, RTL) and English (LTR).** i18n is built in from day one:
- UI strings: `next-intl` message files `fa.json` / `en.json`. CMS content: localized DB fields (`*_fa`, `*_en`) served by the Go API.
- URLs: `/` = Persian, `/en/...` = English. `hreflang` tags and a language switcher in the header.
- Dates: Jalali for `fa`, Gregorian for `en`. Digits: Persian for `fa`, Latin for `en`.
- Components use logical CSS properties (`ms-`/`me-`, `start`/`end`), never `left`/`right`, so they flip automatically.
- ❓ Who writes the English copy? (Follow-up F4.) 🛠 Proposal: we draft the English and the client reviews it.

## 4. Removed from v1 ✅ (client answers #4, #17, #20, #25, #26)

Remove these from the design and the content, even where the Figma design or the Word files still show them:
- The whole marketplace: «خرید و فروش», «اعلام بار», listings, «مشاهده اطلاعات فروشنده», buy requests, featured/urgent listings
- Identity verification and the «تأیید شده ✓» badge (#18: no ID documents)
- Trading groups (گروه‌های معاملاتی) and Matching / هوش بازار
- The Enterprise (سازمانی) tier and the public API
- Home: the «آخرین آگهی‌های بازار» section and the «ورود به بازار خرید و فروش» CTA
- FAQ category «خرید و فروش و اعلام بار» (questions 19–26), plus Terms §8–§9 and the §4 guarantee sentence (see §11)

## 5. Site map (v1)

| # | Page (fa / en) | Access | Notes |
|---|---|---|---|
| 1 | صفحه اصلی / Home | public | Hero, live price cards, services, subscription banner, stats, CTAs |
| 2 | قیمت فلزات / Metal Prices | public, depth by tier | Table + filters + gainers/losers + sources |
| 3 | نمودار قیمت / Price Chart | public, history depth by tier | Chart, compare, ranges |
| 4 | پیش‌بینی و تحلیل / Forecast & Analysis | news public; analysis + forecasts Gold | Written by the client's experts in the CMS (#22) |
| 5 | حراج‌های روزانه / Daily Auctions (IME) | Gold (teaser for others) | 🛠 See §7 |
| 6 | ماشین حساب / Calculator | Gold (locked preview for others) | 🛠 Logic in §8 |
| 7 | اشتراک‌ها / Plans | public | 3 tiers, §6 |
| 8 | سوالات متداول / FAQ | public | From FAQ.docx, with the page requirements in CLAUDE.md |
| 9 | درباره ما / About | public | From درباره ما.docx |
| 10 | ارتباط با ما / Contact | public | Contact form. Contact details left empty for now (#30), editable in the admin |
| 11 | قوانین / Terms | public | From قوانین.docx, edited (§11) |
| 12 | حریم خصوصی / Privacy | public | 🛠 We draft it (#27) |
| 13 | مجوزها و اعتبار / Licenses | public | Built now, hidden until the licenses exist (#29). Content editable in the admin |
| 14 | ورود / ثبت‌نام: Login / Sign-up | — | 🛠 §9. Designed by us in the Figma style (#9) |
| 15 | داشبورد کاربر / Account | logged in | Profile, subscription and billing history, SMS alert settings (Gold), saved calculations, support tickets |
| 16 | پرداخت / Checkout + result | logged in | Gateway redirect → success/failure page |
| — | Admin panel `/admin` | staff | Everything editable (#10), §10 |

🛠 Header nav: صفحه اصلی · قیمت فلزات · نمودار قیمت · پیش‌بینی و تحلیل · حراج‌های روزانه · ماشین حساب, then search, language switch, ورود, ثبت‌نام (the gold button; «شروع کنید» dropped, it did the same thing).
Footer: links to the rest (plans, FAQ, about, contact, terms, privacy, licenses).
The pill-shaped sticky bottom nav from the prototype is 🛠 **not** built on desktop. On mobile it becomes a bottom tab bar
(Home, Prices, Chart, Analysis, Account), which fits the design and improves mobile UX.
Mobile layouts: 🛠 we design them, since there's no mobile design (#9).

## 6. Subscriptions ✅ (client answers #2, #16, #19)

| Tier | Monthly price | Quarterly 🛠 | Yearly 🛠 |
|---|---|---|---|
| رایگان / Free | 0 | — | — |
| نقره‌ای / Silver | **1,000,000 Toman** | 2,700,000 (−10%) | 9,600,000 (−20%) |
| طلایی / Gold | **2,000,000 Toman** | 5,400,000 (−10%) | 19,200,000 (−20%) |

The yearly −20% matches the design badge. The quarterly −10% is our proposal (follow-up F6). Prices are editable in the admin.

### Feature matrix — 🛠 derived from FAQ.docx #12–15 (the client's answer #3 was cut off after «طبق…», follow-up F2)

| Feature | Free | Silver | Gold |
|---|---|---|---|
| Main prices: 7 base metals (ticker, home cards) | ✓ | ✓ | ✓ |
| Full price table (all products, all markets, domestic + global) | partial (base product per metal + **all global/LME prices**, client 2026-10-25) | ✓ | ✓ |
| Price chart | last 1 month | full history + compare | full history + compare |
| News | ✓ | ✓ | ✓ |
| Expert market analysis | ✗ (locked, blurred teaser) | ✗ | ✓ |
| Price forecast scenarios | ✗ | ✗ | ✓ |
| Daily auctions / IME offerings | ✗ (teaser) | ✗ | ✓ |
| Price calculator | ✗ (locked preview) | ✗ | ✓ |
| SMS + price alerts (included in Gold, #19) | ✗ | ✗ | ✓ |
| Support | ticket | ticket | ticket (priority) |

This lives in `services/api/internal/access` as config (exposed to the UIs via `/v1/me/entitlements`), so when the client corrects it, one file changes.
Locked items follow the design pattern (🔒 lock, blur, «ارتقا به طلایی»), and **locked data is never sent to the browser**.

Billing rules 🛠 (built in M3, `services/api/internal/billing/rules.go`):
- Activates immediately after payment verification (server-to-server with the gateway, never from the redirect alone).
- Periods are fixed days: month = 30, quarter = 90, year = 365 (makes proration exact and predictable).
- **Renewal** (buying the plan you have) is queued: it starts when the current one ends, so no paid day is lost.
- **Upgrade** Silver → Gold at any time: starts now; the unpaid-for rest of every lower paid plan (running or queued) is
  credited in proportion to the time left. Manually granted plans give no credit.
- **Downgrade** takes effect at the end of the current period (queued like a renewal).
- If credit leaves less than 1,000 Toman to pay, the rest is waived (gateways refuse tiny payments).
- No auto-renew (Iranian gateways don't support card-on-file). An SMS reminder goes out 3 days before expiry, once per plan,
  unless the user has already renewed. Text: site setting `sms_templates` (editable).

Refund policy 🛠 (#32): full refund within 7 days of purchase if no paid feature has been used. Once used, there's no refund, and the subscription runs until the end of its period.
Built as: the user requests it on the account page; an admin approves or rejects it in the admin panel. Approving cancels that
order's plan; the money is transferred back by hand (Iranian gateways have no refund API) and the transfer reference is noted.
"Used" = the API delivered Silver/Gold-only data under that plan (the full price table, non-base or >1-month chart history,
and later analysis, calculator…). Browsing the base prices (ticker, home cards) doesn't count. A queued renewal can always be
refunded until it starts.
"Used" means the user opened Gold/Silver-only content or ran a Gold calculation. This is logged server-side so it can be checked. (We draft the text, the client reviews it.)

## 7. Daily auctions («حراج‌های روزانه») — 🛠 decision for client answer #5

**Chosen: option B. Show IME daily offering and auction data (information only).** There's no in-site bidding system.
- It matches FAQ.docx category 5 («بورس کالا و حراج‌های روزانه») and the About page («اطلاعات حراج‌ها و عرضه‌های روزانه»).
- The marketplace was removed (#4), so an internal auction system would have no sellers.
- Page: a table per day with product, producer/offerer, volume offered, base price, demand, traded volume, clearing price, and change vs base,
  plus filters (metal, date) and a daily summary. The source is IME data (API if available, admin manual entry as fallback, like all prices).
- Gold only. Others see today's headline numbers and a blurred table with «ارتقا به طلایی».

## 8. Price calculator — 🛠 logic for client answer #15

Inputs: metal → product (sets the base price from live data, or a manual price), weight + unit (kg/ton),
impurity %, deductions %, shipping cost (Toman) with a **"who pays shipping" toggle** (the seller deducts it, or the buyer adds it).
We added the toggle because the prototype and the old spec disagreed on the sign. Optional: price in USD × exchange rate, for global prices.

```
netWeightKg   = weightKg × (1 − impurity%)
grossValue    = netWeightKg × unitPrice              (unitPrice = manual ?? base; USD prices × usdRate)
deductions    = grossValue × deductions%
value         = grossValue − deductions − shipping    (seller pays)   |  + shipping (buyer pays)
```
All math uses integers in Rial and is rounded only for display. Pure function in `services/api/internal/calculator`, unit-tested with golden vectors.
Saved calculations are per user. Share = a link with the inputs encoded. Gold only (see the matrix).
The result is labeled «برآورد» (estimate) per the copy rule.

## 9. Auth — 🛠 for client answer #11 (OTP required at sign-up)

- **Keycloak** (self-hosted) with a Persian/English themed login.
- **Sign-up: mobile number + SMS OTP (required)**, then one form (client, 2026-10-25): name or company, password and its
  repeat, field of activity, acceptance of the terms and privacy policy (required); specialty metals (several), province,
  city, address (optional). Older accounts fill the missing required parts once, at their next sign-in.
- **Login: mobile + OTP (default), or mobile + password** if the user set one in the account page.
- «فراموشی رمز عبور» = OTP to the mobile, then set a new password.
- Needs an SMS provider for OTP. The client will provide the account details ("I'll send you the info").
- Staff (admin/editor/support) log into `/admin` through the same Keycloak, with roles.

## 10. Admin panel (client answer #10: everything editable) ✅

Admin SPA (Refine) at `admin.alanfelez.ir` on the Go API, in Persian and English, with roles:
- **Content:** news, analyses, forecasts (rich text, images, categories, tier lock flag), FAQ (categories, order, "popular" flag),
  pages (about, terms, privacy, licenses), homepage blocks, services cards, stats.
- **Market data:** metals, products, markets/sources, **manual price entry** (single and bulk CSV), price history corrections,
  IME daily auction entries, and the source health dashboard (last successful fetch per source).
- **Commerce:** plans and prices, subscriptions (grant/extend manually), payments and invoices, refund requests.
- **Users:** list, subscription status, block (identities themselves are managed in Keycloak).
- **Support:** contact-form messages, tickets, replies.
- **Site settings:** contact info (empty for now, #30), social links, footer text, license badges, SMS templates.

## 11. Legal and content drafting — 🛠 (client answers #26–28, #31–33)

- **Terms (قوانین):** remove §8 «اعلام بار» and §9 (user-to-user transactions), the guarantee sentence in §4, and the «آگهی‌دهنده»
  definition. Fill the placeholders (date = publish date; email/phone come from site settings).
- **Privacy policy:** we draft it (data collected: mobile, name, email, payment records, usage logs; purpose; retention; Keycloak/SMS/gateway
  processors; user rights). ⚠️ The client should have a lawyer review the Terms, Privacy and Refund policy before launch.
- **About «ارزش‌های ما»:** one value per letter of «الان فلز» (ا-ل-ا-ن-ف-ل-ز). We pick the clearest option for each letter. Draft:
  ا اعتماد · ل لحظه‌ای بودن اطلاعات · ا اطلاعات دقیق · ن نظم · ف فایده و کاربرد · ل لبریز از تخصص · ز زلالیت و شفافیت.
  Also remove «اعلام بار» mentions from the About text and CTAs (the CTA becomes: قیمت فلزات · نمودار قیمت · پلن‌های اشتراک).
- **Home stats (#31):** 🛠 **don't show made-up numbers** (12,000 users, 28,000 trades). That conflicts with the brand values
  (شفافیت، اصالت) and there's no marketplace anymore. Instead, show real, verifiable figures pulled from the DB:
  number of tracked products, number of data sources, markets covered (7 metals), and last update time. Admin-editable.
- **Icons (#33):** 🛠 a consistent **duotone icon set** (e.g. Phosphor duotone) in the brand colors for services and features.
  Colored metal chips/dots for metals, as on the prototype About page. No emoji in production UI.
- **FAQ:** remove questions 19–26 (marketplace) and question 47's link wording until the licenses exist. Keep the rest verbatim.

## 12. Support — 🛠 (client answer #21)

v1 has a contact form (stored in the admin + email notification to staff) and **tickets** in the user account (a simple thread, status, admin reply).
A live-chat widget (Goftino or Raychat) can be added later as a script whose ID is set in site settings. It's off by default.

## 13. Price data — ✅ (client answer #8)

Automatic fetch from APIs, with the **admin manual entry as fallback** when an API doesn't respond.
Every price row stores its source and whether it was entered manually. The UI shows the source and last-updated time.
If a source is stale beyond its threshold, the admin dashboard shows it and staff can enter the price manually.
❓ We still need the actual APIs/providers and access (follow-up F5). Until then we build the adapter interface + manual entry + seed data.

## 14. Charts and units — 🛠 (client answer #23)

- Domestic prices: **Toman/kg** by default, with switches for **Rial** and **ton**. Global (LME) prices: **USD/ton** (standard), with an optional
  "convert to Toman" using the day's USD rate (the rate source is shown).
- Ranges: 1D · 1W · 1M · 3M · 6M · 1Y · 3Y · MAX, where MAX = all stored history. Free is limited to 1M.
- Compare up to 4 series, with the same unit enforced.

## 15. Payments and trust (client answers #12, #29)

Assume the gateway and eNamad exist (the client is getting them). Build behind the `PaymentGateway` interface.
The provider will be set when the client confirms which gateway he got. The eNamad badge slot goes in the footer and the licenses page, hidden until configured.

## 16. Content and support — 🛠 decisions built in M4

**Analysis page (#4).** Three article types: **news** (everyone reads it), **market analysis** and **price forecast** (the full
text is Gold; title, summary and cover are public teasers, and the API never sends a locked body). The type is the lock, so
editors can't publish paid text by mistake. Each article can have a metal and/or a topic category (tabs: the 7 metals + اقتصاد ·
بازار جهانی · ضایعات), an optional **analyst view** (صعودی / نزولی / خنثی, labeled «دیدگاه کارشناس», never a promise), a featured flag
(the big card) and an author. Analyses and forecasts always end with the estimate disclaimer. The sidebar shows the base prices
(free for everyone, LME included since 2026-10-25) with source and time. Reading a Gold body counts as "used" for refunds.

**FAQ (#8).** From FAQ.docx, with the page requirements in CLAUDE.md (accordion, search, categories, popular block, deep link
`/faq#slug`, FAQPage schema with exactly the visible questions, CTA). Marketplace questions 19–26 and 43, 49 are left out;
Q1, Q4, Q15 and Q42 lose only their marketplace clause; Q47 is unpublished until the licenses page exists (edits listed in F14).
Popular block: questions 1, 5, 12, 16, 33, 50.

**Pages (#9, #11–13).** About and Terms from the Word files (edited as §11 says, plus the other marketplace-only lines, F14);
Privacy is our draft (§11, lawyer review F8). "Last updated" is the page's save time (no manual date to forget). Contact
details under Terms/Privacy come from the site settings and only show when set. Every save keeps the previous text
(`page_revisions`). The Licenses page is built but hidden until the flag `page.licenses` is on.

**Contact (#10).** Form: name, mobile, optional e-mail, subject (سوال عمومی · پشتیبانی فنی · اشتراک و پرداخت · همکاری تجاری · پیشنهاد
و انتقاد · سایر), message. No file attachment yet (needs media storage). The design's «گزارش تخلف» (listings/users) and
API/enterprise blocks are removed (§4). Messages land in the admin inbox with a menu badge; the e-mail notification to staff
waits for an e-mail provider (F15). Abuse controls: SECURITY §4.

**Tickets (#15, §12).** Signed-in users open tickets from the account page; one thread per request, plain text. Status shows whose
turn it is: «در انتظار پاسخ» (support) → «پاسخ داده شد» (user) → «بسته شده»; a user reply reopens a closed ticket. Gold users'
tickets are **high priority** and top the queue. Users see replies as «پشتیبانی الان‌فلز», never the agent's name. No SMS/e-mail on
a reply yet (the account page shows the status; F15).

**Admin (#10).** Roles: content (articles, categories, FAQ, pages) = editor or admin; tickets and contact inbox = support or admin;
site settings = admin; everyone on staff can read. Every write is audit-logged. Rich text is edited in TipTap and sanitized
on save (ADR-0025).

## 17. Gold features — 🛠 decisions built in M5

**Daily auctions (§7).** Page `/auctions`: pick a trading day and a metal; everyone sees the day's summary (offerings,
volume offered / demanded / traded, trade value, volume-weighted average change vs base); the table (product, producer,
offered, base price, demand, traded, discovered price, change) is Gold. Data is entered in the admin (*IME auctions*: a form
row or a table pasted from Excel, checked before saving; re-entering a row corrects it) until an IME data source exists (F16).
Prices Toman/kg, volumes tonnes. Viewing the table counts as "used" for refunds.

**Calculator (§8).** As specified, computed by the API (`internal/calculator`), recalculated as you type. Products: the domestic
(IRR) price series, grouped metal → product type → product; the base price is the series' latest price with its source and
time, and a manual price overrides it. Weights in kg or tonnes; Persian digits and «٫» accepted. Save up to 50 calculations
(the result is frozen at save time); "share" copies a link with the inputs (the recipient needs Gold to compute). Not built
yet: USD prices × exchange rate for LME products, and the design's "advanced" box (multi-load compare, quality settings,
PDF), which the client hasn't asked for.

**SMS price alerts (#19).** On the account page (Gold): up to 20 alerts, each on any series the user can see —
«بالاتر از» / «پایین‌تر از» a price, or «تغییر روزانه بیش از» a percentage (0.5–50 %). The worker checks every minute.
Above/below fire once when the price crosses and re-arm only after it moves back 0.5 % (no SMS storms around a threshold),
at most one SMS per alert per hour; a daily-move alert fires at most once a day. At most 10 alert SMS per user per day, and all
alerts pause when the daily SMS budget (site setting `sms`) is spent. When the Gold plan ends, alerts stop and stay listed
(paused / deletable). Texts are the `price_alert_*` entries of `sms_templates` (editable). Until the SMS provider exists (F7)
the local/staging "console" provider only logs them.
