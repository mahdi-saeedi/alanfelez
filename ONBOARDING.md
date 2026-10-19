# Welcome to الان‌فلز (Alan Felez)

This page is for a developer joining the project. You don't need to know the codebase, and you don't install anything:
you work with **Claude Code in the browser** (claude.ai/code), which reads this repo's guides and recipes and writes code
the way the project expects. Your job: say clearly what is needed, check the result on the test site, and publish it.
The owner shares a longer step-by-step guide (Persian and English).

## 1. What the project is
A Persian/English website for Iran's metals market: live prices and charts, expert analysis, IME auction data, a load-value
calculator, SMS price alerts, and Free / Silver / Gold subscriptions. The spec is `docs/product/SCOPE.md`; open work is in
`docs/TODO.md`. Claude reads the parts a task needs.

| Part | Folder | What it does |
|---|---|---|
| Website | `apps/web` | What visitors see (Next.js) |
| Admin panel | `apps/admin` | Where staff enter prices, write articles, answer tickets |
| API + worker | `services/api` | All data and all rules (Go). The website and admin only ask the API |
| Login | `services/keycloak`, `apps/keycloak-theme` | Sign-in with phone OTP (Keycloak) |
| Deploy | `deploy/` | How it runs on the servers (Kubernetes, Argo CD), see `docs/guides/DEPLOYMENT.md` |

## 2. The flow: every change, test site first

```
you → Claude (claude.ai/code) → pull request → you merge → staging.alanfelez.ir → stakeholder OK → you publish a release → alanfelez.ir
```

1. **Ask.** New conversation in claude.ai/code with the `mahdi-saeedi/alanfelez` repo. Say what and why. For anything bigger
   than a small fix: "Explain your plan in plain words first."
2. **Review.** Claude opens a pull request. The checks must be green. Read Claude's description; ask "why?" where unclear.
3. **Merge.** Press *Merge pull request*. About 10 minutes later the change is on **https://staging.alanfelez.ir**
   (shared password from the owner).
4. **Check on staging**: Persian, English (`/en`), phone width. Send the link to the stakeholder and wait for their OK.
5. **Publish.** Ask Claude to publish a release (or GitHub → Releases → *Draft a new release* → next `vX.Y.Z` → *Publish*).
   A pull request "production → vX.Y.Z" appears; merge it. About 10 minutes later it's on **https://alanfelez.ir**.
6. **Problem on production?** Ask Claude to roll production back (or GitHub → Actions → *Rollback* → production), then tell
   the owner.

## 3. Rules
- Never paste passwords, keys or tokens into a chat, an issue or a commit.
- Never merge with red checks; never publish to production without the stakeholder's OK on staging.
- **Ask the owner first** for anything about money, payments, refunds, which plan unlocks what, sign-in, deleting or
  changing existing data, the servers, or anything the client must decide (it goes to `docs/product/OPEN_QUESTIONS.md`).
- Client Persian text is used verbatim. The brand is «الان‌فلز», never «آلان‌فلز». No marketplace / «اعلام بار» features.
  Never promise prices or profit («قیمت قطعی»، «تضمین سود»).
- Nobody changes the servers by hand: everything goes through GitHub (that's what keeps every change reversible and the
  whole service rebuildable, `docs/guides/REBUILD.md`).
- If Claude says a guard (hook) blocked something, that's intended: send its message to the owner.

## 4. Optional: working on your own computer
Not needed for normal work. If you ever want the whole stack locally (faster previews before a pull request), follow
`docs/guides/LOCAL_SETUP.md` (Mac and Linux tested; on Windows use WSL) or ask Claude to do it with you.
