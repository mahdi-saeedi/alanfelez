---
name: ship-change
description: Send finished work to staging (staging.alanfelez.ir) — branch, checks, Conventional Commit, push to a ship/<slug> branch, watch until it's merged and deployed. Use when the user says the work is done, "send it to staging", "deploy to staging", "ship it", "commit", "push" or "open a PR".
---

# Ship a change to staging

The developer works only in the chat: they never open GitHub. Claude can push branches but can't merge (in claude.ai/code
`gh pr …` doesn't work, and the guard forbids it), so **pushing a branch named `ship/<slug>` is the "merge button"**:
`.github/workflows/ship.yml` runs every CI check on it, and when they're green it opens a pull request as the record,
squash-merges it into `main`, deletes the branch and starts the Release workflow, which deploys staging (≈10–15 min in
total). Red checks → nothing is merged.

**Only ship when the user asks** ("send it to staging", "ship it", "deploy"). Their "yes" in the chat is the approval.

1. **Branch**: work on a branch, never on `main` (claude.ai/code gives you a `claude/…` branch; locally
   `git switch -c feat/<short-slug>` from an up-to-date `main`).
2. **Check** what this environment can run (read the output; fix, don't skip):
   - `task check` — generated code up to date, Go lint + unit tests, TS typecheck, Helm lint
   - `task test:integration` if Go handlers, SQL or migrations changed (needs `task up`)
   - UI changes: looked at in the browser pane in fa + en, phone + desktop
   - Can't run something here (no Docker in the cloud session)? Say so; the ship workflow runs the full CI anyway.
3. **Review your own diff** (`git diff origin/main...`) against the Definition of Done in `CONTRIBUTING.md` §5: no hard-coded
   text, both message files, negative access tests, audit on staff writes, docs updated, no secrets, no debug leftovers.
   3b. **Update `docs/TODO.md`** (skill `update-todo`): done items to Done, new findings added.
4. **Commit** in Conventional Commits. The **first commit's subject becomes the title** of the pull request and of the
   squashed commit on main, so make it describe the whole change: `feat(auctions): filter offerings by producer`,
   `fix(web): …`. Scopes: CONTRIBUTING §3. End the message with the attribution lines the session asks for.
5. **Bring it up to date with main**: `git fetch origin main && git rebase origin/main` (or merge). Resolve conflicts now;
   a conflicting branch can't be merged by the workflow.
6. **Ship**: `git push origin HEAD:ship/<short-slug>` (a new slug per change; pushing again to the same slug restarts the
   checks with the new commits).
7. **Watch** and tell the user in plain words (repo `mahdi-saeedi/alanfelez`; `gh api` works in claude.ai/code):
   - `gh api "repos/mahdi-saeedi/alanfelez/actions/runs?branch=ship/<slug>&per_page=1" --jq '.workflow_runs[0] | {status, conclusion, html_url}'`
   - Red: list the failed jobs (`gh api repos/mahdi-saeedi/alanfelez/actions/runs/<id>/jobs --jq '.jobs[] | select(.conclusion=="failure") | {id, name}'`),
     read the log (`gh api repos/mahdi-saeedi/alanfelez/actions/jobs/<job-id>/logs | tail -100`), fix, commit, push to
     the same `ship/<slug>` again. "Could not merge" = conflict with main: step 5, then push again.
   - Green: then the Release workflow runs on main (`gh api "repos/mahdi-saeedi/alanfelez/actions/workflows/release.yml/runs?per_page=1" --jq '.workflow_runs[0] | {status, conclusion}'`).
     When it succeeds, staging updates within a few minutes (Argo CD).
8. **Hand over**: "It's on https://staging.alanfelez.ir. Check it in Persian, English (`/en`) and on a phone, and send the
   link to the stakeholder. When they say OK, tell me 'publish to production'" (skill `release-to-production`).

Someone who prefers GitHub can still open a normal pull request and press Merge; that also deploys staging.
