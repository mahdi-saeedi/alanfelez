# Project Process: Scope, Milestones, Change Control

> Why this exists: the client delegated many decisions ("do it yourself, I'll correct later"). Without a baseline and a change process,
> "corrections" become unlimited free work and the schedule slips. This doc protects both sides.

## 1. Scope baseline
- **Baseline v1 = [SCOPE.md](SCOPE.md) + [NFR.md](NFR.md)** at the git tag `scope-v1`.
- Step 1: send the client a **Persian summary of SCOPE.md** (including every 🛠 decision) and ask for written approval.
  Approval is recorded in `docs/client/` with the date.
- After approval, changes to the baseline only go through §3.

## 2. Milestones and acceptance (UAT)
| Milestone | Deliverable on staging | Client acceptance |
|---|---|---|
| M1 Foundation | Monorepo, CI/CD, staging live, design system, i18n shell (fa/en), header/footer, login stub | Look & feel sign-off on 2–3 sample pages |
| M2 Market data | Home, Metal Prices, Price Chart with live SSE, admin manual price entry | Prices accurate, updates live, admin entry works |
| M3 Accounts & billing | OTP sign-up, account, plans, checkout (sandbox), access control | Tiers behave as in the matrix |
| M4 Content | Forecast & Analysis, FAQ, About, Terms, Privacy, Licenses, Contact, tickets, full admin | Content correct in fa/en |
| M5 Gold features | Calculator, IME daily auctions, SMS alerts | Gold features accepted |
| M6 Launch | Mobile polish, SEO, performance and security review, load test, production go-live | Go-live sign-off |

For each milestone:
1. Demo on staging.
2. The client gets a **UAT checklist** (Persian) of the acceptance criteria.
3. The client has **5 working days** to report issues.
4. Issues are classified as a **Defect** (doesn't match the approved scope, we fix it for free) or a **Change** (new or different from the scope, see §3).
5. Written sign-off, filed in `docs/client/`.

## 3. Change requests
Anything that differs from the approved baseline is a **Change Request (CR)**, and the 🛠 dev decisions count too once the scope is approved.

| Step | Detail |
|---|---|
| Log | GitHub issue labeled `change-request`: what, why, requested by, date |
| Assess | Impact on effort (hours), schedule, cost, risk, and on other features |
| Decide | The client approves in writing (message or email copied into the issue), or it goes to the backlog for a later phase |
| Record | Update SCOPE.md in the implementing PR and reference the CR issue |

Small changes (< 2 h, cosmetic, no model or API change) can be batched and approved together at the milestone demo.

## 4. Backlog and tracking
- **GitHub Issues + a Projects board** (Backlog → Ready → In progress → Review → Done). One milestone per M1–M6.
- Every issue has acceptance criteria. Labels: `type:feature|bug|chore|change-request`, `area:*` (same as commit scopes), `priority:p0–p3`, `blocked:client`.
- Issues waiting on the client are labeled `blocked:client` and linked to an OPEN_QUESTIONS item.

## 5. Estimation and reporting
- Estimate per issue in ideal hours. Milestone estimate = sum × **1.3** buffer (a solo developer carries all the risk).
- Weekly status to the client (short, Persian): done, next, blocked-on-client items, risks. Template in `docs/client/weekly-status-template.md` *(to add)*.

## 6. Client communication rules
- Decisions are made **in writing**. Chat/phone decisions get summarized back to the client and logged in OPEN_QUESTIONS or a CR.
- One source of truth for pending questions: [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md). Question docs to the client are generated from it, prioritized 🔴/🟠/🟢.
