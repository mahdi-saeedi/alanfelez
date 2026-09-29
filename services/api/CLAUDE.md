# Go API and worker (`services/api`)

One binary, `cmd/alanfelez`, with subcommands: `serve` (HTTP API), `worker` (River background jobs), `migrate`, `seed`,
`bootstrap` (migrate + seed, used by the deploy job). Everything is wired by hand in `cmd/alanfelez/main.go` (no DI framework).
Rules for the API surface: `docs/architecture/API_GUIDELINES.md`. Data model: `docs/architecture/DATA_MODEL.md`.

## Where things are
| Path | What |
|---|---|
| `../../contracts/openapi.yaml` | **The API contract.** Every endpoint starts here |
| `internal/api/` | HTTP handlers, one file per area: `prices.go`, `billing.go`, `content.go`, `support.go`, `gold.go`, `admin*.go`. `helpers.go` has the problem helpers and `requireRoles` |
| `internal/api/api.gen.go` | Generated strict server (oapi-codegen). **Don't edit**; `task generate` |
| `internal/api/routes.go` | `Mount`: auth middleware, the SSE stream, the rate limit, the generated routes |
| `migrations/0000N_*.sql` | goose migrations (embedded). One per milestone so far; add a new numbered file, never edit an applied one |
| `queries/*.sql` | sqlc queries → `internal/dbq/` (generated, **don't edit**) |
| `internal/access` | **The tier matrix** (Feature → minimum tier, limits). The only place tier rules live |
| `internal/<domain>` | Domain logic, pure where possible: `prices`, `billing`, `payment`, `calculator`, `auctions`, `alerts`, `content`, `support`, `notify` (SMS), `audit` |
| `internal/jobs` | River workers and periodic jobs (`jobs.go`: `river.AddWorker`, `river.NewPeriodicJob`) |
| `internal/seed` | Seed loader for `config/seed/**` (`seed.Datasets` lists what files may write) |
| `internal/platform/*` | Config (env vars), DB pool, HTTP helpers (problems, client IP), Jalali dates, logging, rate limiter |
| `internal/testdb` | Throwaway Postgres database per integration test |

## The shape of a handler (copy this)
Handlers implement the generated `StrictServerInterface`. Real example: `SaveMyCalculation` in `internal/api/gold.go`.
```go
// SaveThing … (one-line doc comment saying what and who)
func (s *Server) SaveThing(ctx context.Context, req SaveThingRequestObject) (SaveThingResponseObject, error) {
	p := auth.FromContext(ctx)                       // nil = anonymous
	if p == nil {
		return fail[SaveThingdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	cur, err := s.tiers.Tier(ctx, p)                 // the caller's plan
	if err != nil {
		return nil, err
	}
	if !access.Allowed(cur.Tier, access.SomeFeature) { // tier check: ONLY through internal/access
		return fail[SaveThingdefaultApplicationProblemPlusJSONResponse](lockedProblem(ctx, access.SomeFeature)), nil
	}
	name, ok := content.Clean(req.Body.Name, 1, 80)  // validate yourself: the generated server does NOT enforce schema bounds
	if !ok {
		return fail[SaveThingdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "name must be 1–80 characters")), nil
	}
	row, err := s.q.InsertThing(ctx, dbq.InsertThingParams{UserID: p.ID, Name: name})
	if err != nil {
		return nil, fmt.Errorf("save thing: %w", err)   // unexpected errors: return them (→ 500, logged), wrapped
	}
	s.billing.RecordUsage(ctx, cur.SubscriptionID, access.SomeFeature) // paid feature used (feeds the refund rule)
	return SaveThing201JSONResponse{Id: row.ID.Bytes, Name: name}, nil
}
```
- **Expected failures** (validation, 401/403/404/409) are `fail[...](problem)` with `nil` error. Helpers: `badRequest`, `notFound`,
  `conflict`, `unauthenticated`, `lockedProblem`, `problem(ctx, status, code, title, detail)`. Codes are listed in API_GUIDELINES §4.
- New operations declare only `default: { $ref: '#/components/responses/Problem' }` for errors, so the type is always
  `<Operation>defaultApplicationProblemPlusJSONResponse`.
- **Clamp and check every input** (lengths, page sizes, ranges). Rich text: `content.Sanitize` on write (ADR-0025).
- **Owner checks:** a user's row is fetched with `WHERE id = $1 AND user_id = $2`; another user's row is a 404, never a 403.
- **Anonymous callers** work too: `s.tiers.Tier(ctx, nil)` is Free. For "summary for everyone, details for Gold", see `GetAuctions`
  (`featureLock` → `locked` + `requiredPlan` in the response, and the locked rows are simply not included).

## Staff (admin) endpoints
```go
p, pr := requireRoles(ctx, rolesContentWrite...)   // role lists at the top of admin.go / admin_content.go / admin_support.go
if pr != nil { return fail[...](*pr), nil }
err := s.tx(ctx, func(q *dbq.Queries) error {       // write + audit in ONE transaction
	if err := q.UpdateThing(ctx, ...); err != nil { return err }
	return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "thing.update", Entity: "thing", EntityID: id, Data: ...})
})
```
Roles: `staff` (can read the admin), `editor` (prices, content, IME), `support` (tickets, contact), `admin` (everything,
settings, granting plans). Read endpoints use `rolesRead`. Example: `AdminDeleteAuction` in `gold.go`.

## Database
- **Migrations are expand/contract:** add columns nullable or with a default, backfill, and only drop in a later release. Each file has
  `-- +goose Up` and `-- +goose Down`. Schemas: `market.*` (metals, products, prices, IME), `app.*` (users, plans, orders, subscriptions, content, support, settings), `river` (job queue, owned by River).
- Money = `bigint` Rial (`*_rial` or `*_minor`), weights = `bigint` kg, time = `timestamptz` (UTC), IDs = `uuid DEFAULT gen_random_uuid()`.
  Add `CHECK` constraints for invariants. Comment tables and non-obvious columns in the migration.
- Queries: name them `-- name: VerbThing :one|:many|:exec|:execrows`, use table aliases in UPDATE/JOIN (ambiguity errors bit us before),
  `sqlc.narg(x)` for optional params. Then `task generate`.
- Changing data that already exists in production = a migration (or the admin), never a seed file edit (`config/seed/README.md`).

## Background jobs
Worker + args in `internal/jobs/jobs.go`, registered with `river.AddWorker`; periodic ones in the `periodic` list with a stable `ID`.
Jobs must be idempotent (they retry). SMS goes through `internal/notify` and respects the daily budget; see `AlertsWorker`.

## Tests
- **Unit tests** (`*_test.go`) for pure logic: rules, calculations, validation (e.g. `alerts/rules_test.go`, `calculator`). `task test`.
- **Integration tests** (`internal/api/*_integration_test.go`, build tag `integration`) run the real router on a fresh Postgres:
  `e := setup(t)`, then `e.call(method, path, token, body)` where `token` is a test identity: `""` anonymous, `user`, `silver`,
  `gold`, `editor`, `support`, `admin`. `e.grantGold()` gives the `gold` user a Gold plan. `e.count(sql)` checks the DB. `task test:integration`.
- Every new gated endpoint needs **negative tests**: anonymous → 401, wrong tier → FEATURE_LOCKED with no data, other user's id → 404,
  wrong staff role → 403. Critical packages (`access`, `billing`, `prices`, `calculator`) keep ≥ 90 % coverage.

## Lint gotchas (golangci-lint)
- int → int32 conversions need a bound check (gosec G115); if it's bounded, say so in a `//nolint:gosec // bounded by …` comment.
- Errors from other packages must be wrapped (`fmt.Errorf("what: %w", err)`, wrapcheck). No `//nolint` without a reason.
