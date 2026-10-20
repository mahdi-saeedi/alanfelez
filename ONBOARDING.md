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

## 2. The flow: everything in the chat, test site first

```
you → Claude (claude.ai/code) → "send it to staging" → staging.alanfelez.ir → stakeholder OK → "publish" → alanfelez.ir
```

You never need to open GitHub. Everything below is a sentence you type to Claude.

1. **Ask.** New conversation in claude.ai/code with the `mahdi-saeedi/alanfelez` repo. Say what and why. For anything bigger
   than a small fix: "Explain your plan in plain words first." Say yes or ask for changes.
2. **"Send it to staging."** Claude runs all the checks on GitHub. Green → it's merged and on
   **https://staging.alanfelez.ir** about 15 minutes later; Claude tells you. Red → nothing changes; Claude reads the error,
   fixes it and tries again.
3. **Check on staging**: Persian, English (`/en`), phone width. Send the link to the stakeholder and wait for their OK.
   Something wrong → back to step 1 ("on staging X is broken, fix it").
4. **"Publish to production."** Claude tells you what will go live, then publishes exactly what is on staging as a new
   version (`v0.2.0`, …). About 10 minutes later it's on **https://alanfelez.ir**. Take a quick look.
5. **Problem on production?** "Roll production back." Claude puts the previous version back; then tell the owner.

(If you ever prefer GitHub's buttons: merging a pull request also deploys staging, and Actions → *Publish to production* /
*Rollback* do the same as steps 4 and 5.)

## 3. Rules
- Never paste passwords, keys or tokens into a chat, an issue or a commit.
- Never publish to production without the stakeholder's OK on staging. Claude ships only when you say so.
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
