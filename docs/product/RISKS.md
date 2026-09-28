# Risk Register

> Review at every milestone. Probability (P) and Impact (I): 1 = low, 3 = high. Score = P × I.

| ID | Risk | P | I | Score | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R-01 | **Price APIs don't exist or aren't accessible** (IME, Iron market, free market) (F5) | 3 | 3 | 9 | Manual entry + CSV in the admin from M2. Adapter interface so APIs plug in later. Ask the client early about data agreements | Dev + client | Open |
| R-02 | **Keycloak SMS OTP** needs a custom or community SPI and a themed RTL login, which takes longer than expected | 2 | 3 | 6 | Spike in M1 (2–3 days, timeboxed). Fallback: a small Go OTP service that issues Keycloak sessions via token exchange, or reconsider the IdP (new ADR) | Dev | Open |
| R-03 | **Scope creep** from "I'll correct later" and 🛠 decisions | 3 | 2 | 6 | Scope baseline + change control (PROCESS.md). UAT per milestone | Dev | Open |
| R-04 | **The newest design isn't available** (F1). Building from screenshots means rework | 2 | 2 | 4 | Build the design system/tokens first (stable). Pages from the newest screenshots. Ask again for the link | Client | Open |
| R-05 | **Solo developer** (bus factor 1): illness or leaving stalls the project | 2 | 3 | 6 | Everything documented (ADRs, runbooks, README ≤ 30 min setup). Infra as code. Credentials in a shared vault the client can access | Dev | Open |
| R-06 | **English content** not provided in time | 2 | 2 | 4 | i18n built in, English behind a feature flag. We draft it and the client reviews | Client | Open |
| R-07 | **SMS cost abuse** (OTP pumping) | 2 | 2 | 4 | SECURITY §4 limits, CAPTCHA, budget breaker, alerts | Dev | Open |
| R-08 | **Sanctions / connectivity**: registry or package access from Iran, GitHub runner → Arvan SSH | 2 | 2 | 4 | Build in CI abroad, Arvan registry, mirrored base images, self-hosted runner fallback | Dev | Open |
| R-09 | **Payment gateway or eNamad delayed** (client is obtaining them) | 2 | 2 | 4 | Build against the sandbox/mock adapter. Launch in "free only" mode if needed (feature flag) | Client | Open |
| R-10 | **Legal texts** (Terms, Privacy, Refund) drafted by devs aren't legally sound | 2 | 2 | 4 | Client lawyer review before launch (F8). Don't launch paid tiers without it | Client | Open |
| R-11 | **Incorrect price published** (source error or manual mistake) harms reputation | 2 | 3 | 6 | Outlier quarantine, audit log, 4-eyes option, source and time always shown, correction workflow | Dev + editors | Open |
| R-12 | **Tier matrix changes** after build (F2) | 2 | 1 | 2 | Config-driven access (ADR-0010). The change is one file + tests | Dev | Open |
| R-13 | **Performance on Iranian mobile networks** | 2 | 2 | 4 | Budgets in NFR, Lighthouse CI, Arvan CDN, self-hosted subset fonts, lazy charts | Dev | Open |
