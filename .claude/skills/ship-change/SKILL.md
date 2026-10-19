---
name: ship-change
description: Finish a change and get it merged: branch, checks, Conventional Commit, push, pull request, CI. Use when the user says the work is done, "commit", "push", "open a PR" or "ship it".
---

# Ship a change

1. **Branch**: never commit on `main`. `git switch -c feat/<short-slug>` (or `fix/`, `docs/`, `chore/`) from an up-to-date `main`
   (`git fetch && git switch main && git pull --ff-only` first). If work is already on `main` locally, move it to a branch before committing.
2. **Check** (and read the output; fix, don't skip):
   - `task check` — generated code up to date, Go lint + unit tests, TS typecheck, Helm lint
   - `task test:integration` if Go handlers, SQL or migrations changed (needs `task up`)
   - UI changes: looked at in the browser pane in fa + en, phone + desktop
3. **Review your own diff** (`git diff main...`) against the Definition of Done in `CONTRIBUTING.md` §5: no hard-coded text,
   both message files, negative access tests, audit on staff writes, docs updated, no secrets, no debug leftovers.
3b. **Update `docs/TODO.md`** (skill `update-todo`): done items to Done, new findings added.
4. **Commit** in Conventional Commits, grouped by area if the change is big:
   `feat(auctions): filter offerings by producer`, `fix(web): …`, `docs: …`. Scopes: CONTRIBUTING §3. The hooks check the format
   and run gitleaks. End the message with the attribution lines the session asks for.
5. **Push and open a PR**: `git push -u origin HEAD`, then `gh pr create` with the template (`.github/pull_request_template.md`):
   what and why in plain words, how it was tested, screenshots for UI, risk and rollback. Link the issue if there is one.
6. **CI**: wait for the checks on the PR (`gh pr checks`). If one fails, read the log (`gh run view --log-failed`), fix, push again.
7. **A person merges, not Claude.** Give the PR link and say what to check. Once they merge (CI green), it deploys to
   staging.alanfelez.ir within ~10 minutes; production comes later through the `release-to-production` skill.
