# Welcome to الان‌فلز (Alan Felez)

This page is for a developer joining the project. You don't need to know the whole codebase: you work **together with
Claude Code**, which reads this repo's guides and recipes and writes code the way the project expects. Your job is to say
clearly what you need, check what Claude did, and ask the owner when something is a business decision.

## 1. What the project is (5 minutes)
A Persian/English website for Iran's metals market: live prices and charts, expert analysis, IME auction data, a load-value
calculator, SMS price alerts, and Free / Silver / Gold subscriptions. Parts:

| Part | Folder | What it does |
|---|---|---|
| Website | `apps/web` | What visitors see (Next.js) |
| Admin panel | `apps/admin` | Where staff enter prices, write articles, answer tickets |
| API + worker | `services/api` | All data and all rules (Go). The website and admin only ask the API |
| Login | `services/keycloak`, `apps/keycloak-theme` | Sign-in with phone OTP (Keycloak) |
| Deploy | `deploy/` | How it runs on the servers (Kubernetes, Argo CD) |

The spec is `docs/product/SCOPE.md`. You don't have to read everything: Claude will read the parts a task needs.

## 2. Set up your machine (about 30 minutes)
Follow `docs/guides/LOCAL_SETUP.md` §2–3. In short: install Docker, Git and mise, then
```bash
git clone https://github.com/mahdi-saeedi/alanfelez.git && cd alanfelez
task setup
task up
task ps
```
Open http://localhost:3000 (website), http://localhost:5173 (admin; sign in as `local-editor` from LOCAL_SETUP's users table),
http://localhost:8080/v1/metals (API). Then install Claude Code and run `claude` in the repo folder.

## 3. How to work with Claude
**Every task, the same loop:**
1. **Say what you want and why**, in normal words. Persian or English both work. Examples:
   - "On the auctions page, add a filter by producer. Gold users only, like the rest of the table."
   - "The contact form shows 'failed' when I send a long message. Find out why and fix it."
   - "Staff should be able to reorder article categories in the admin."
2. **Ask for the plan first** when the task is more than a small fix: "Explain your plan before changing code."
   Read it. If you don't understand a step, ask "why?", which is how you learn the codebase.
3. **Let Claude build and test it.** It knows the commands (`task check`, integration tests, the browser pane).
4. **Look at the result yourself**: open the page in fa and en, on a phone-sized window, click through it.
5. **"Ship it"**: Claude creates a branch, commits, pushes and opens a pull request. The owner reviews and merges.

**Useful phrases**
- "Follow the add-web-page recipe" (or `add-api-endpoint`, `add-admin-page`, `db-change`, `paid-feature`, `debug-issue`, `ship-change`).
- "What files will this touch?" · "Show me the diff" · "Run the checks again" · "Explain this code to me".
- "Is this a decision for the owner or the client?"

**Stop and ask the owner** (Claude is told to do the same) before anything that touches:
money, payments, refunds · which plan unlocks what · login/Keycloak · deleting or changing existing data ·
production · secrets · anything the client hasn't decided (it goes to `docs/product/OPEN_QUESTIONS.md`).

## 4. What's protected (so mistakes stay small)
- **You can't break production from your laptop.** Changes reach the servers only through a pull request that the owner merges.
  Claude has read-only access to production (logs, status) and full access to local and staging.
- **Guard hooks** (`.claude/hooks/`) stop Claude from pushing to `main`, force-pushing, merging PRs, editing generated code or
  old migrations, and changing the production cluster. If Claude says a hook blocked something, that's intended: ask the owner.
- **CI** runs every check on every pull request. A red check means "not done yet".
- Your mistakes on local are free: `task reset` rebuilds the local stack from scratch (it deletes local data).

## 5. Rules worth knowing yourself
- The brand is «الان‌فلز», never «آلان‌فلز».
- Persian text from the client is used exactly as given. All UI text lives in message files, in Persian **and** English.
- No marketplace or «اعلام بار» features (removed from v1).
- Never promise prices or profit («قیمت قطعی»، «تضمین سود»). Prices always show their source and time.
- Money is stored as whole Rial and shown in Toman. No decimals for money.
- No real passwords, API keys or tokens in chats, code or commits.

## 6. Where to look
| Question | Look at |
|---|---|
| What should the product do? | `docs/product/SCOPE.md`, `docs/product/OPEN_QUESTIONS.md` |
| How is it built? | `CLAUDE.md` files (root and per folder), `docs/architecture/ARCHITECTURE.md` |
| How do I test / deploy / run it? | `docs/guides/` |
| What's left before launch? | `docs/guides/LAUNCH.md` |
