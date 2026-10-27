# Data Model

> Status: **Proposed**. This is the logical model. The source of truth after scaffolding is the goose migrations in `services/api/migrations/`.
> This doc explains the *why*. Update it in the same PR as any schema change.

## 1. Principles
- Two Postgres schemas: **`market`** (market data, high volume) and **`app`** (users, billing, content, support). Keycloak has its own database.
- **Money:** `bigint` in the **minor unit of its currency**, with an explicit `currency` column. IRR is stored in **Rial** (Toman = Rial / 10, display only). USD is stored in **cents**. No floats, no `numeric` in the hot path.
- **Quantities:** a price is always "per `unit`" (`kg`, `ton`). Conversions live in `market.units`. Weights in the calculator are in **grams** (`bigint`).
- **Time:** every timestamp is `timestamptz` (UTC). Jalali/Gregorian conversion happens only in the UI. Market-day logic uses `Asia/Tehran`.
- **i18n:** user-facing names use paired columns `name_fa`, `name_en` (NOT NULL for fa, nullable for en until translated). Rich text is `body_fa` / `body_en` `jsonb` (TipTap) + `*_html` (sanitized, rendered at save time).
- **IDs:** `uuid` (v7, time-ordered) for app entities. `bigint identity` for high-volume market rows. Public URLs use `slug`s, never IDs.
- **Soft delete** only where the business needs history (content, plans). Everything else uses a hard delete + audit log.
- Every table has `created_at` and `updated_at`. Staff-editable tables also have `updated_by` (FK to users) and write to `app.audit_log`.

## 2. Market schema

```mermaid
erDiagram
  metals ||--o{ products : has
  product_categories ||--o{ products : groups
  products ||--o{ price_series : "priced as"
  markets ||--o{ price_series : "quoted on"
  markets ||--o{ sources : "fed by"
  price_series ||--o{ price_points : history
  price_series ||--|| price_latest : "latest"
  sources ||--o{ source_runs : health
  sources ||--o{ price_points : produced
  products ||--o{ ime_offerings : "offered as"

  metals { smallint id PK; text slug; text name_fa; text name_en; int sort }
  product_categories { smallint id PK; text slug "raw|intermediate|scrap"; text name_fa; text name_en }
  products { int id PK; smallint metal_id FK; smallint category_id FK; text slug; text name_fa; text name_en; bool is_base "shown to Free" }
  markets { smallint id PK; text slug "ime|iron|free|lme|smm"; text name_fa; text name_en; text scope "domestic|global" }
  sources { smallint id PK; smallint market_id FK; text adapter; jsonb config; interval stale_after; bool enabled }
  price_series { int id PK; int product_id FK; smallint market_id FK; char3 currency "IRR|USD"; text unit "kg|ton"; bool active }
  price_points { bigint id PK; int series_id FK; timestamptz observed_at; bigint price_minor; bool is_manual; uuid entered_by; smallint source_id FK }
  price_latest { int series_id PK; bigint price_minor; timestamptz observed_at; bigint prev_close_minor; timestamptz updated_at }
  source_runs { bigint id PK; smallint source_id FK; timestamptz started_at; text status; int points; text error }
  ime_offerings { bigint id PK; date session_date; int product_id FK; text offerer; bigint volume_kg; bigint base_price_minor; bigint demand_kg; bigint traded_kg; bigint clearing_price_minor }
```

Key decisions:
- **`price_series` is the identity of a price**, not the product. "Copper cathode on IME in IRR/kg" and "Copper on LME in USD/ton" are different series.
  Charts, the ticker, the table rows and alerts all reference a `series_id`.
- **`price_points`** is append-only. There's a unique `(series_id, observed_at)` constraint, so ingestion is idempotent. Index: `(series_id, observed_at DESC)`.
  Corrections are a new manual point, or a staff edit that's recorded in the audit log.
  Partition by year if it grows past ~50M rows. The TimescaleDB decision follows measurements (ADR-0007).
- **`price_latest`** is maintained in the same transaction as the insert. It's the fallback when Redis is empty (AVL-3).
  `prev_close_minor` = the last point of the previous **trading** day (it uses `market.holidays`), which drives "تغییر روزانه" and "درصد تغییر".
- **Data-quality gate:** a point that deviates more than `max_jump_pct` (per series, default 15 %) from `price_latest` is stored with
  `status = 'quarantined'` and isn't published until staff approve it (SECURITY §6). The column is omitted from the diagram for brevity.
- Supporting tables: `units(code, to_kg_factor)`, `fx_rates(pair, observed_at, rate_micro)`, `holidays(day, market_id NULL = all, reason_fa)`.

**Built in M2** (migration `00002_prices.sql`): `products`, `sources`, `price_series`, `price_points`, `price_latest`, `source_runs`.
Differences from the sketch above, and why:
- `price_series.is_base` marks the headline series per metal that the free tier sees (SCOPE §6); `max_jump_bp` is the outlier threshold in basis points.
- `price_points.status` is `published | quarantined | rejected` (with `reviewed_by/at`); only published points reach charts, `price_latest` and the stream.
- `sources.provider` picks the Go adapter and `sources.config` (jsonb, never secrets) configures it. Manual entry is the `manual` source.
- `prev_close_minor` is the last published price of an earlier **Tehran calendar day**, taken when a later day's first point arrives. Days without points (weekends, holidays) are skipped naturally, so `holidays` isn't needed for it. `units`, `fx_rates` and `holidays` come with the chart unit switch and the IME calendar.

## 3. App schema

```mermaid
erDiagram
  users ||--o{ subscriptions : has
  users ||--o{ orders : places
  plans ||--o{ plan_prices : "priced by"
  plan_prices ||--o{ orders : "bought as"
  orders ||--o{ payments : "paid by"
  orders ||--o| subscriptions : creates
  subscriptions ||--o{ entitlement_usage : "used"
  orders ||--o{ refunds : "refunded by"
  users ||--o{ alert_rules : sets
  users ||--o{ saved_calculations : saves
  users ||--o{ tickets : opens
  tickets ||--o{ ticket_messages : contains
  users ||--o{ notifications : receives

  users { uuid id PK; text keycloak_sub UK; text phone_e164 UK; text first_name; text last_name; text email; text locale; timestamptz blocked_at }
  plans { text code PK "free|silver|gold"; text name_fa; text name_en; int rank; bool active }
  plan_prices { uuid id PK; text plan_code FK; text period "month|quarter|year"; bigint amount_rial; timestamptz valid_from; timestamptz valid_to }
  orders { uuid id PK; uuid user_id FK; uuid plan_price_id FK; bigint amount_rial; bigint credit_rial "proration"; text status; text idempotency_key UK }
  payments { uuid id PK; uuid order_id FK; text gateway; text authority UK; text ref_id; text status; jsonb raw; timestamptz verified_at }
  subscriptions { uuid id PK; uuid user_id FK; text plan_code FK; timestamptz starts_at; timestamptz ends_at; text status; uuid order_id FK }
  entitlement_usage { uuid subscription_id FK; text feature; timestamptz first_used_at }
  refunds { uuid id PK; uuid order_id FK; bigint amount_rial; text status; text reason; uuid decided_by }
  alert_rules { uuid id PK; uuid user_id FK; int series_id; text kind "above|below|move_pct"; bigint threshold; text channel "sms"; bool active }
  saved_calculations { uuid id PK; uuid user_id FK; text name; jsonb inputs; bigint result_rial }
  tickets { uuid id PK; uuid user_id FK; text subject; text status; text priority }
  ticket_messages { uuid id PK; uuid ticket_id FK; uuid author_id; text body; bool is_staff }
  notifications { uuid id PK; uuid user_id FK; text channel; text template; text status; int cost_rial }
```

Key decisions:
- **The effective tier** = the highest-ranked `subscriptions` row with `status='active' AND now() BETWEEN starts_at AND ends_at`, or `free` if none.
  **Built in M3** (migration `00003_billing.sql`): `users` (id = Keycloak `sub`, refreshed from token claims on `/v1/me`),
  `orders` (price, credit, amount, kind, quoted start), `payments`, `refunds`, `entitlement_usage`, `notifications`
  (with a `dedupe_key` so jobs can re-run). Subscriptions gained `order_id` and the `replaced` status (ended by an upgrade).
  Overlaps are prevented by the per-user advisory lock + queued placement instead of an exclusion constraint (ADR-0024).
  M2 created `app.subscriptions` early (keyed by the Keycloak `user_id`, `origin = manual | order`) so staff can grant plans before checkout exists; `order_id` and the exclusion constraint are added with billing (expand migration). `app.audit_log` exists too (every staff write).
  An exclusion constraint prevents overlapping active subscriptions for the same user and plan.
- **Plan prices are versioned** (`valid_from`/`valid_to`). Orders keep a reference to the exact price row, so history never changes when prices change.
- **Payment flow:** `orders.idempotency_key` + unique `payments.authority` make callbacks safe to repeat. The subscription is created in the **same transaction** as a successful verify.
- **`entitlement_usage`** records the first use of each paid feature. It's the objective basis for the refund policy (SCOPE §6).
- **`notifications`** logs every SMS with its cost. It feeds the SMS budget alerts (SECURITY §4).

### Content, support and platform tables
| Table | Purpose |
|---|---|
| `articles` | `type` (news / analysis / forecast: decides who reads the **body**, `internal/content`), `slug`, `status` (draft / published / archived = soft delete), `metal_id`, `category_id`, `outlook` (up / down / neutral, the author's view), `featured`, `title_*`, `summary_*` (plain text), `body_*` (sanitized HTML, ADR-0025), `author_*`, `cover_url`, `read_minutes`, `published_at` |
| `article_categories` | Topic tabs on the analysis page besides the metals (economy, global, scrap) |
| `faq_categories`, `faq_items` | `slug` (stable deep link, never changes), `question_*`, `answer_*` (sanitized HTML), `popular`, `sort`, `published` |
| `pages`, `page_revisions` | about / terms / privacy / licenses: `slug`, `title_*`, `body_*`, `published`, `version` (optimistic lock). Every save first copies the old text into `page_revisions (slug, version)`, so the Terms in force on any date can be shown |
| `site_settings` | Key → `jsonb` (contact info, social links, license badges, stats config, SMS templates) |
| `feature_flags` | `key`, `enabled`, `rules jsonb` (ADR-0016) |
| `media` | ⏳ Not built yet (covers are URLs until uploads to Arvan Object Storage exist): object-storage key, mime type, size, dimensions, `alt_fa`/`alt_en` |
| `contact_messages` | Contact form submissions (plain text): name, phone, optional e-mail, subject, body, `user_id` when signed in, client `ip` + `user_agent` (abuse review), `status` new / handled / spam, staff `note` |
| `tickets`, `ticket_messages` | A thread per user request. `number` (shown to users), `status` = whose turn (open = support, answered = user, closed), `priority` (high = `support.priority` at creation), `Idempotency-Key` per user. Messages are plain text with `is_staff`; agents' names are shown only in the admin |
| `app.daily_visits`, `app.visit_salts` | Visitor stats (2026-10-27): one row per Tehran day and visitor (`u:<user id>` or `a:<sha256(day salt, IP, UA)>`), first/last time, page views. Salts older than yesterday are deleted, rows after 90 days (nightly cleanup). No IP stored |
| `market.auctions` | Metal auctions (SCOPE §7, 2026-10-26): `title_fa/en`, metal, `category` intermediate/scrap/raw, `quantity` + `unit` ton/kg/piece, `status` open/paused/closed (staff), `deadline_at`, `location_*`, `organizer_*`, `details_*` (plain text). Public: title, metal, category, quantity, status; the rest Gold |
| `market.auction_files` | The auction's PDF notice (ADR-0027): one per auction, `bytea` ≤ 10 MB, deleted with the auction |
| `market.ime_offerings` | **No longer shown (2026-10-26)**; rows kept until the owner decides. IME session rows (SCOPE §7): `trade_date` (Tehran day), metal, product, producer, `offered_kg`, `base_price_rial` (Rial/kg), `demand_kg`, `traded_kg`, `clearing_price_rial` (null until traded), `source` manual / demo / api. Natural key (day, product, producer) = re-entry corrects |
| `calculations` | Saved calculator runs (Gold, max 50 per user): name, series, `input` and `result` JSON frozen at save time |
| `price_alerts` | SMS alerts (Gold, max 20): series, `kind` above / below / move, `threshold_minor` or `move_bp`, `active`, `armed` (edge trigger), `last_triggered_at`. Sent SMS go to `notifications` (template `price_alert_*`, dedupe key per firing) |
| `audit_log` | `actor_id`, `actor_role`, `action`, `entity`, `entity_id`, `before jsonb`, `after jsonb`, `ip`, `user_agent`, `at`. **Append-only**: the app DB role has no UPDATE/DELETE on it |

## 4. Redis keys
| Key | Type | TTL | Purpose |
|---|---|---|---|
| `prices:updates` | pub/sub channel | — | SSE fan-out: JSON array of published points (`internal/prices/live`). Current prices themselves are read from Postgres `price_latest` (M2: fast enough, one source of truth) |
| `rl:{scope}:{id}:{window}` | counter | window | Fixed-window rate limits (`internal/platform/ratelimit`; contact form per client IP). Later: API, OTP, scraping |
| `otp:cooldown:{phone}` | string | 120 s | OTP resend cooldown (with the Keycloak SPI) |
| `cache:{route}:{hash}` | string | 30–300 s | Short-lived API response cache for public reads |

## 5. Retention
| Data | Retention |
|---|---|
| `price_points`, `ime_offerings` | Forever (this is the product) |
| `auctions`, `auction_files` | Until staff delete them |
| `calculations`, `price_alerts` | Until the user deletes them or the account is deleted (cascade) |
| `source_runs` | 90 days |
| `audit_log` | 3 years |
| `notifications` | 1 year |
| `payments`, `orders`, `refunds` | 10 years (financial records) |
| `contact_messages`, closed `tickets` | 2 years |
| Application logs | 30 days (Loki) |
