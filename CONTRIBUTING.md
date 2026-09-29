# Contributing

This is how we work on الان‌فلز. Read [README.md](README.md) first.

## 1. Toolchain
- The versions of Go, Node, pnpm and Task are pinned in **`mise.toml`** and installed with **[mise](https://mise.jdx.dev)**: run `mise install` (ADR-0018).
- Git hooks are managed by **lefthook** (`lefthook install`, which `task setup` runs for you):
  - `pre-commit`: Go formatting (golangci-lint fmt) on staged files, **gitleaks**
  - `commit-msg`: Conventional Commits check
  - `pre-push`: `task generate:check` (generated code up to date), fast unit tests
- Common commands (all in `Taskfile.yml`): `task setup` · `task up` / `task down` · `task smoke` · `task generate` · `task lint` · `task test` · `task seed` · `task k8s:*`. Run `task --list` for all of them

## 2. Branching (trunk-based)
- `main` is always deployable and auto-deploys to **staging**. **Production = git tags** `vX.Y.Z`.
- Short-lived branches from `main`: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/…`, `docs/…`. Merge within a few days.
- Unfinished features are merged **behind a feature flag** (ADR-0016), not kept on long-lived branches.
- **Squash merge.** The PR title becomes the commit message, so it must follow Conventional Commits.

## 3. Commits (Conventional Commits)
```
feat(prices): add gainers/losers sidebar
fix(billing): prevent double subscription on repeated callback
docs(adr): add ADR-0019 search engine
```
Types: `feat` · `fix` · `perf` · `refactor` · `test` · `docs` · `build` · `ci` · `chore`. Add `!` or a `BREAKING CHANGE:` footer for breaking changes.
Scopes: `prices`, `chart`, `auctions`, `calculator`, `analysis`, `billing`, `auth`, `access`, `content`, `faq`, `support`, `admin`, `web`, `ui`, `infra`, `api`.
**release-please** builds the changelog and version from these.

## 4. Pull requests
- One concern per PR, ideally **< 400 changed lines** (excluding generated code). Link the issue (`Closes #123`).
- Fill in the PR template: what/why, screenshots (fa **and** en, mobile and desktop for UI), test notes, risk/rollback.
- CI must be green. Solo phase: self-review with the checklist below, wait a few hours or a night, then merge. When a second developer joins, 1 approving review is required (CODEOWNERS).

## 5. Definition of Done
A change is done when **all** of these hold:
- [ ] Behavior matches SCOPE.md / the issue's acceptance criteria. Any deviation is noted in the PR and in OPEN_QUESTIONS if the client must decide
- [ ] API change: `openapi.yaml` updated first, generated code committed, no unintended breaking change (oasdiff)
- [ ] Tests at the right level (TESTING.md). Critical packages keep ≥ 90 % coverage
- [ ] Access control: new data is gated by a `Feature` and has negative tests (no leakage)
- [ ] UI: works in **fa (RTL) and en (LTR)**, at 360 px and desktop, keyboard accessible, no axe serious/critical violations, all copy in message files or the CMS (no hard-coded strings, client copy verbatim)
- [ ] DB: goose migration is backward compatible (expand/contract), and DATA_MODEL.md is updated if the model changed
- [ ] Security checklist (SECURITY §10) for endpoints, secrets, rich text and staff actions
- [ ] Observability: errors reported, key metrics/logs added for new jobs or integrations, alert + runbook if it can page
- [ ] Docs: README / ADR / guides updated if setup, architecture or conventions changed
- [ ] Deployed to staging and smoke-checked

## 6. Code conventions (short version, details in ARCHITECTURE §5 and API_GUIDELINES.md)
**Go**
- Package by domain in `internal/<domain>`: `handler.go` (thin, generated interface), `service.go` (logic), `queries/*.sql` (sqlc), `*_test.go`.
- Pass `context.Context` first. Wrap errors with `%w`. Map domain errors to problem codes in one place (`platform/httpx`).
- No package-level mutable state. Wire dependencies explicitly in `cmd/*/main.go` (no DI framework).
- `golangci-lint` config is in the repo. Don't use `//nolint` without a reason comment.

**TypeScript / React**
- Strict TS, no `any`. Server components by default, and `"use client"` only where needed.
- A `"use client"` file exports **components only**. Constants, types-with-values and helpers that server code also
  uses go in a plain module (e.g. `lib/nav.ts`, `components/gold/calc-form.ts`): a server component importing a value
  from a client file gets a client reference, not the value (this broke the calculator page once).
- API access only through `packages/api-client` (generated). Never hand-write request types.
- Styling: Tailwind with design tokens. **Logical properties only** (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`). No `left`/`right` classes.
- Text: `next-intl` messages or CMS fields. Numbers, dates and money go through the shared formatters (`packages/ui/format`).

## 7. Architecture changes
Anything that changes how the system is built needs a **new ADR** in `docs/architecture/adr/`, in the same PR:
a new dependency category, datastore, service, auth flow, or a cross-cutting convention.
