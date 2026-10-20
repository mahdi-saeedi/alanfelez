---
name: release-to-production
description: Publish what is on staging to production (alanfelez.ir), or roll production (or staging) back. Use when the user says the stakeholder approved staging, "publish", "release", "deploy to production", "go live with this", or "roll back".
---

# Publish to production (or roll back)

The developer works only in the chat. Claude starts both by **pushing a branch** (claude.ai/code can push branches, not
tags, and can't press workflow buttons); the workflow deletes the branch when done. Repo: `mahdi-saeedi/alanfelez`.

- **Publish** = push `publish/production` → `.github/workflows/publish.yml` takes **exactly the images staging runs**
  (`images.*.tag` in `deploy/environments/staging/values.yaml`, no rebuild), picks the next version (any `feat` → minor,
  otherwise patch; `v0.1.0` first), tags the images `vX.Y.Z`, commits it to `deploy/environments/production/values.yaml`
  and creates the GitHub release with notes from the commits. Argo CD on the production server applies it within minutes
  (canary, automatic rollback if the new pods fail).
- **Roll back** = push `rollback/production` (or `rollback/staging`) → `.github/workflows/rollback.yml` puts the previous
  version back.

## Publish
1. **Approved?** Ask the user to confirm the stakeholder approved what is on staging now. Never publish without it.
   Prefer outside market hours (OPERATIONS §6); say so if it's during them.
2. **What goes out:** staging's tag is `sha-<12>` = a commit on main. `git fetch origin --tags` then
   `git log --oneline --no-merges <last v-tag>..<that commit>` (no tag yet: everything). Tell the user in plain words what
   will go live. If main has newer commits than staging runs, those are **not** included (they weren't checked); say so.
   If a ship or Release run is still in progress, wait for it so staging and the user agree on what they checked.
3. **Publish:** `git fetch origin main && git push origin origin/main:refs/heads/publish/production` (the branch content doesn't matter; only its
   name). If the push is refused because the branch exists, a publish is still running: wait for it.
4. **Watch:** `gh api "repos/mahdi-saeedi/alanfelez/actions/workflows/publish.yml/runs?per_page=1" --jq '.workflow_runs[0] | {status, conclusion, html_url}'`.
   Red: read the failed job's log (`…/actions/runs/<id>/jobs`, then `…/actions/jobs/<job-id>/logs`), explain it, fix
   through ship-change if it's code. "Nothing to publish" = production already runs this version.
5. **Report:** the version (`gh api repos/mahdi-saeedi/alanfelez/releases/latest --jq .tag_name`) and "it's on
   https://alanfelez.ir in about 10 minutes; check the home page, prices and signing in". If you can reach the site, check
   `https://alanfelez.ir` and `https://api.alanfelez.ir/v1/metals` answer. Update `docs/TODO.md` (Done: "released vX.Y.Z: …").

Version by hand (e.g. a major): Actions → Publish to production → Run workflow → pick the step. That's a GitHub button;
offer it only if the user asks.

## Roll back
Production broken after a publish: confirm with the user, then `git fetch origin main && git push origin origin/main:refs/heads/rollback/production`.
Watch `…/actions/workflows/rollback.yml/runs?per_page=1` the same way. It commits the previous version; Argo CD applies it.
A specific older version: Actions → Rollback → Run workflow (a GitHub button) with `version`. Tell the user and the owner,
then find the cause with the `debug-issue` skill and ship the fix, then publish again.

## Never
- Publish or roll back without the user asking in this chat. Never edit `deploy/environments/production/values.yaml`
  image tags by hand, push to main, or run kubectl/helm against production (it's read-only, `deploy/CLAUDE.md`).
