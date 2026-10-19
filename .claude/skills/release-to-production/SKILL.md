---
name: release-to-production
description: Publish what is on staging to production (alanfelez.ir) with a release, or roll production back. Use when the user says the stakeholder approved staging, "publish", "release", "deploy to production", "go live with this", or "roll back production".
---

# Release to production (or roll back)

How it works (`.github/workflows/release.yml`, `docs/guides/DEPLOYMENT.md` §1): a tag `vX.Y.Z` builds the images with that
tag and opens a pull request "chore(deploy): production → vX.Y.Z" that changes `deploy/environments/production/values.yaml`.
**Merging that PR is the deploy**: Argo CD on the production server applies it within minutes (canary, automatic
rollback if the new pods don't come up). Claude never merges it; a person does.

## Release
1. **Check it's approved:** ask the user to confirm the stakeholder approved what is on staging. Never release without it.
2. **What goes out:** `git fetch --tags` then `git log --oneline <last tag>..origin/main` (no tag yet: everything). Summarize it
   in plain words for the user. Staging runs `images.*.tag` of `deploy/environments/staging/values.yaml`; make sure main's
   head is what was checked on staging (no newer unchecked merges); if not, say which changes weren't checked.
3. **Version:** next semantic version after `git tag --sort=-v:refname | head -1` (none yet: `v0.1.0`). Patch for fixes,
   minor for features. Before launch stay on `0.x`.
4. **Publish:** `gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes "<the plain-words summary>"`.
5. **Watch:** `gh run list --workflow Release --limit 1`, wait for success (images built, scanned). If it fails, read
   `gh run view --log-failed`, fix through a normal PR, and release the next patch version.
6. **Hand over the merge:** find the PR (`gh pr list --search "production → vX.Y.Z"`), give the user its link and say:
   "Merging this publishes vX.Y.Z to alanfelez.ir in about 10 minutes."
7. **After they merge:** check `https://alanfelez.ir` and `https://api.alanfelez.ir/v1/metals` answer, and the version the
   API logs report. Update `docs/TODO.md` (Done: "released vX.Y.Z: …").

## Roll back
Production broken after a release: `gh workflow run rollback.yml -f environment=production` (empty version = the previous
tag; or `-f version=vX.Y.Z`). It commits the older tag; Argo CD applies it. Tell the user and the owner, then find the cause
with the `debug-issue` skill and ship the fix as a new release.

## Never
- Release or roll back without the user asking. Never edit `deploy/environments/production/values.yaml` image tags by hand
  or run kubectl/helm against production (it's read-only, `deploy/CLAUDE.md`).
