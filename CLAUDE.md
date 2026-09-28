# الان‌فلز (Alan Felez) — Metals Market Information Platform

A bilingual platform (Persian RTL as the default, plus English) for Iran's metals market: live prices, price charts,
expert analysis and forecasts, IME daily auction data, a load-value calculator, and 3-tier subscriptions (Free / Silver / Gold).
The client already runs Iranian servers (ArvanCloud) and owns both domains, alanfelez.ir and alanfelez.com.
**Status:** M1 + M2 done. `task up` runs web (Next.js), admin (Refine), Go API + worker (River), Postgres, Redis and the custom
Keycloak (phone OTP, Keycloakify theme, staff TOTP). Prices: demo generator locally, manual/CSV entry in the admin, live over SSE,
tier-gated in Go. `task k8s:*` runs the same apps on local k3d with Argo CD + Rollouts. Next: M3 accounts, subscriptions, payments.
**Stack:** Go backend (`services/api`: chi, spec-first OpenAPI, pgx/sqlc/goose, River, SSE) · Next.js public site · Refine admin ·
Postgres · Redis · custom Keycloak · Docker Compose (local) · k3s + Helm + Argo CD/Rollouts (staging/prod) · GitHub Actions CI. **Contract first:** edit `contracts/openapi.yaml`, then `task generate`.
There's one developer (the user) plus AI assistants, and the project must be easy to hand over to a future developer.

## Read these first
| Doc | What |
|---|---|
| [`docs/product/SCOPE.md`](docs/product/SCOPE.md) | **The primary spec.** Confirmed v1 scope, feature matrix, and all 🛠 dev decisions |
| [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) | Tech stack, repo layout, main flows, conventions |
| [`docs/architecture/adr/`](docs/architecture/adr/) | One file per architecture decision |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow, commits, **Definition of Done**, code conventions |
| `docs/architecture/NFR.md`, `DATA_MODEL.md`, `API_GUIDELINES.md`, `SECURITY.md`, `OPERATIONS.md`, `TESTING.md`, `PROCESS.md`, `RISKS.md` | Engineering baselines. Follow them when writing code |
| [`docs/product/OPEN_QUESTIONS.md`](docs/product/OPEN_QUESTIONS.md) | Client answers (round 1) and open follow-ups F1–F9 |
| [`docs/content/`](docs/content/) | Client-provided copy: `faq.fa.txt`, `about.fa.txt`, `terms.fa.txt`. Source of truth for text |
| [`docs/design/screenshots/summary-draft/`](docs/design/screenshots/summary-draft/) | Newest design screenshots (15, named by page) |

Source-of-truth order: **client Word files (content/features) > SCOPE.md > Figma design (look & feel) > older spec docs**.
When sources conflict or something is unspecified, don't guess. Add it to `docs/product/OPEN_QUESTIONS.md` as a follow-up.

## Hard rules
- **Brand name is «الان‌فلز» / "Alan Felez"**, not «آلان‌فلز». The design and prototype still use the old spelling, so replace it.
- **Removed from v1:** marketplace / «اعلام بار» / listings / seller contact, the verified badge, trading groups, Matching,
  the Enterprise tier, the API. If the design or the Word files show them, leave them out anyway (SCOPE §4).
- Visual style follows the Figma design: layout, components, colors (tokens below), Vazirmatn font.
- Client copy is used **verbatim**. Don't rewrite Persian copy from the Word files. UI strings live in i18n message files,
  CMS content in localized DB fields via the Go API. Never hard-code user-facing text in components.
- **Copy rule:** never «قیمت قطعی», «تضمین سود», «پیش‌بینی قطعی بازار» or similar. Prices and analyses are information and estimates.
  Always show the source and the "last updated" time next to prices.
- **i18n from day one:** `fa` (RTL, Jalali, Persian digits) is the default and `en` (LTR, Gregorian) lives at `/en`. Use logical CSS properties only
  (`ms-*`, `me-*`, `start`, `end`), never `left`/`right`.
- **Access control:** tier/feature checks go through `services/api/internal/access` only (Go), and they're config-driven. UIs read `/v1/me/entitlements`. Locked data is **never sent to
  the browser**. The 🔒 UI is presentation only.
- **Money** is integer Rial (`bigint`), shown in Toman. **Dates** are stored as UTC `timestamptz`. No floats for money.
- **Self-host assets** (fonts, icons). No Google Fonts or foreign CDNs at runtime, since users are in Iran.
- **Git:** Conventional Commits. Commit only when the user asks.

## Figma prototype notes
- Live link: https://ratio-donkey-94517275.figma.site/. It's an **older build** than the newest screenshots (follow-up F1).
  It's a Figma Make app: React + Tailwind v4, custom SVG charts, no UI/chart libraries, state-based navigation.
  Copy can be read from it via the browser pane (`document.body.innerText`), but the Word files override its text.
- The prototype calculator (for reference): net = weight × (1−impurity%), value = net × price × (1−deductions%) − shipping.
  Final logic is in SCOPE §8.

## Design tokens (the prototype's `:root` CSS variables)
```css
--bg: #f2f2f0;  --surface: #fff;  --surface-2: #f8f8f6;
--graphite: #1c2331;  --graphite-2: #2d3748;  --graphite-3: #3d4a5c;   /* header/hero/footer; hero gradient uses #282E3B */
--silver: #6b7280;  --silver-light: #9ca3af;
--border: #e2e2df;  --border-strong: #c8c8c4;
--gold: #c9a227;  --gold-light: #e8c547;                               /* brand accent: primary buttons, lock, Gold tier */
--up: #16a34a;  --up-bg: #dcfce7;  --down: #dc2626;  --down-bg: #fee2e2;
--blue: #2563eb;  --blue-bg: #dbeafe;
--text: #1a1a1f;  --text-2: #4b5563;  --text-3: #9ca3af;
```
- Font: **Vazirmatn** (self-hosted, weights 300–900).
- Animations: the ticker scrolls (`ticker-scroll`), the chart line draws in (`draw`), the live dot pulses (`pulse`).
- Tier badges: رایگان = gray, نقره‌ای = blue-gray, طلایی = gold.
- Cards have rounded corners and a very subtle shadow. Prices are always bold and larger than the surrounding text.
- Icons: a duotone icon set, not emoji (SCOPE §11).
- Shared components: `PriceTicker`, `ChangePill` (arrow + color), `Locked`, `TierBadge`, `LiveDot`, `PriceCard`, `Sparkline`.
- Logo: `docs/design/brand/logo-alanfelez.png`. It's low-res, and a vector is pending (F3).

## FAQ page requirements (from FAQ.docx)
- Accordion, collapsed by default, toggles without reloading.
- Search box at the top, and a «سوالات پر تکرار» block.
- Categories as in FAQ.docx, minus «خرید و فروش و اعلام بار».
- A **shareable deep-link URL per question**.
- SEO-friendly HTML. FAQ schema may only include questions actually shown on the page.
- Fully responsive.
- Closing CTA «پاسخ سوال خود را پیدا نکردید؟ … [تماس با پشتیبانی]».
