# Open Questions & Client Answers

- Round 1 was sent as [`client/questions-round1-sent.docx`](../client/questions-round1-sent.docx) and answered on **2026-09-28**
  in [`client/questions-round1-answered.docx`](../client/questions-round1-answered.docx).
- The resulting scope is in [`SCOPE.md`](SCOPE.md). The full original question list is archived at [`archive/open-questions-round1.md`](../archive/open-questions-round1.md).
- Status: ⏳ waiting on the client · ✅ closed.

## Follow-ups (round 2)

| # | Priority | Question | Why |
|---|---|---|---|
| F1 | 🔴 | ⏳ **Newest design link.** The link https://ratio-donkey-94517275.figma.site/ still serves the old build (menu has «خرید و فروش», and the bundle hasn't changed). Please publish the latest version and send the link. | Needed for pixel-accurate UI (answer #6) |
| F2 | 🔴 | ⏳ **Feature table per tier.** Answer #3 was cut off («طبق…»). We derived a matrix from FAQ.docx (SCOPE §6). Please confirm or correct it, especially: is the **calculator Gold-only**? (The design shows it as free.) | Access control everywhere |
| F3 | 🟠 | ⏳ **Logo as SVG** (or at least a 1024px+ PNG with a transparent background), plus the brand colors if the logo colors should replace the gold UI accent. | Header, favicon, OG images |
| F4 | 🟠 | ⏳ **English copy.** Who writes it? Our proposal: we draft the English and you review. | i18n (answer #24) |
| F5 | 🔴 | ⏳ **Price APIs.** Which APIs or data providers do you have access to (IME, Iron market, free market, LME, USD rate)? Please send docs and keys. Until then we build manual entry + seed data. | Answer #8 |
| F6 | 🟢 | ⏳ **Quarterly/yearly discount.** We proposed quarterly −10% and yearly −20% (SCOPE §6). OK? | Plans page |
| F7 | 🟠 | ⏳ **SMS provider account** (Kavenegar, Ghasedak, …) for OTP and alerts. You said you'll send the details. | Sign-up needs OTP (answer #11) |
| F8 | 🟢 | ⏳ **Legal review.** We will draft Privacy, Refund and the edited Terms (SCOPE §11). They should be reviewed by a lawyer before launch. | Answers #27, #32 |
| F9 | 🟢 | ⏳ **Review all 🛠 dev decisions** in SCOPE.md on staging (auctions = IME info page, calculator logic, auth flow, stats, icons, mobile nav). | Client said "I'll correct later" |
| F10 | 🟠 | ⏳ **Traffic and freshness.** How many users do you expect at launch and after 1 year? How often must each price source update during market hours? (Our assumptions are in NFR.md §1 and §4.) | Server sizing, alert thresholds |
| F11 | 🟠 | ⏳ **Scope sign-off.** Please approve the v1 scope summary (SCOPE.md incl. 🛠 decisions) in writing before development starts (PROCESS.md §1). | Baseline for change control |

## Round 1 — client answers (numbering = client doc)

| # | Topic | Client answer (summary) | Result |
|---|---|---|---|
| 1 | Source of truth | The Word files per section are the source. Display style like Figma | ✅ SCOPE §1 |
| 2 | Tiers | 3 tiers: رایگان، نقره‌ای، طلایی. No Enterprise for now | ✅ |
| 3 | Feature table | «طبق…» (cut off) | 🛠 derived from FAQ → **F2** |
| 4 | Marketplace | Neither. No «اعلام بار» / marketplace section for now | ✅ removed |
| 5 | Auctions | "Do it yourself" | 🛠 IME daily auction info page (SCOPE §7) |
| 6 | Final design | "Check the latest version I sent" | ⚠️ link still old → **F1** |
| 7 | Brand / domains | «الان فلز». Owns both .ir and .com | ✅ SCOPE §2 |
| 8 | Price data | From APIs. If they fail, manual entry in the admin | ✅ + **F5** |
| 9 | Undesigned pages + mobile | "Complete them yourself, I'll correct later" | 🛠 |
| 10 | Admin panel | Everything editable | ✅ SCOPE §10 |
| 11 | Auth | "Your call, I'll give you the info", but **OTP required at sign-up** | ✅/🛠 SCOPE §9 + **F7** |
| 12 | Payment gateway | Getting the gateway and eNamad. Assume they exist | ✅ |
| 13 | Hosting | Iranian server, .ir and .com purchased | ✅ ArvanCloud |
| 14 | Source files | Sent the logo (PNG 215px) only | 🟠 **F3** |
| 15 | Calculator | "Design the logic yourself" | 🛠 SCOPE §8 |
| 16 | Pricing | Silver 1,000,000 / Gold 2,000,000 Toman per month | ✅ + **F6** |
| 17 | «اعلام بار» form | Remove «اعلام بار» | ✅ |
| 18 | Verification | No ID documents | ✅ badge removed |
| 19 | SMS | Included in Gold | ✅ |
| 20 | Trading groups / Matching | Not for now | ✅ removed |
| 21 | Support | "Build it as you see fit" | 🛠 contact form + tickets |
| 22 | Forecasts | Written by our experts | ✅ CMS content |
| 23 | Chart units | "Your call" | 🛠 SCOPE §14 |
| 24 | Language | **Persian and English** | ✅ i18n |
| 25 | Enterprise API | Enterprise removed | ✅ |
| 26 | Terms §4 guarantee | «اعلام بار» removed | ✅ delete the sentence |
| 27 | Legal texts | "Complete it yourself" | 🛠 + **F8** |
| 28 | About values | "Complete it your way" | 🛠 SCOPE §11 |
| 29 | Licenses | Getting them | ✅ page hidden until available |
| 30 | Contact info | Leave empty for now | ✅ admin-editable |
| 31 | Stats | "Your call" | 🛠 real DB-driven figures |
| 32 | Refund policy | "Write it yourself" | 🛠 SCOPE §6 + **F8** |
| 33 | Icons | "Whatever looks most attractive" | 🛠 duotone icon set |
