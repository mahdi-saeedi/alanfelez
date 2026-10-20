# ADR-0026: Ship and publish from the chat (branch-name triggers, promote staging's images)

- **Status:** Accepted (refines ADR-0020: production no longer goes through a release pull request)
- **Date:** 2026-10-20

## Context
Developers work only through Claude Code in the browser (claude.ai/code) and shouldn't need to open GitHub. Those sessions
can push branches, but can't merge pull requests, push tags or start workflows (`gh pr …` uses GraphQL, which the session's
GitHub proxy rejects; tags are refused). Until now staging needed a person to press *Merge*, and production needed a release
tag that **rebuilt** the images and a second pull request to merge, so production ran a different build than the one checked
on staging.

## Decision
- **Branch names are the buttons.** Pushing `ship/<slug>` runs `ship.yml`: the full CI (`ci.yml` as a reusable workflow);
  green → a pull request is opened as the record, squash-merged into main (only the exact commit that was checked) and the
  Release workflow is started, which deploys staging. Pushing `publish/production` runs `publish.yml`; pushing
  `rollback/production|staging` runs `rollback.yml`. Each workflow deletes its trigger branch. All three also work by hand
  from the Actions tab, and normal pull requests merged on GitHub still deploy staging.
- **Production promotes, never rebuilds.** `publish.yml` takes the image tag staging runs (`sha-<12>`), tags the same images
  `vX.Y.Z` in the registry (crane), commits that version to `deploy/environments/production/values.yaml` and creates the
  GitHub release (notes from the commits; `feat` → minor, otherwise patch). Release tags no longer build anything.
- **The approval is the person's "yes" in the chat**: Claude ships or publishes only when asked (skills `ship-change`,
  `release-to-production`), CI must be green, and production takes only what the stakeholder checked on staging.

## Consequences
No GitHub screen is needed for the normal flow, and production runs bit-for-bit what was tested. Nobody reviews the code
on GitHub before it reaches staging: CI, staging and the stakeholder check are the gates, and every step is still a commit,
a pull request record or a release in git (reversible with one push). Anyone with write access can push the trigger
branches, the same people who could merge before. Branch protection (GitHub Pro) would not block these workflows, which
merge with the workflow token.

## Alternatives considered
Auto-merge on green (needs branch protection, so GitHub Pro, and still a pull request the session can't create), a
personal access token in the cloud session (a long-lived secret in a chat environment), merging from comments or labels
(the session can't set labels reliably), continuous deployment of every merge to production (no stakeholder check).
