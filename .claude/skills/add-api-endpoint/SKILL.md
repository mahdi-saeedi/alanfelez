---
name: add-api-endpoint
description: Add or change an endpoint of the Go API (contract first: openapi.yaml → task generate → handler → tests). Use for any new or changed /v1/... route, request field or response field.
---

# Add or change an API endpoint

Read `services/api/CLAUDE.md` first. Closest examples: calculations (`/v1/me/calculations` in `contracts/openapi.yaml`,
handlers `ListMyCalculations` / `SaveMyCalculation` / `DeleteMyCalculation` in `services/api/internal/api/gold.go`).

## Steps
1. **Contract** — edit `contracts/openapi.yaml`:
   - Path under `/v1/...` (user's own data: `/v1/me/...`; staff: `/v1/admin/...`), `operationId` in camelCase, `tags`, a `summary`
     that says who may call it (for example "Roles: editor, admin" or "(Gold)"), `security: [{ bearerAuth: [] }]` unless public.
   - Request/response schemas in `components/schemas` with `required`, `minLength`/`maxLength`/`minimum`/`maximum`.
     Money is a string of integer minor units (Rial) like the existing `Money` schemas; dates `format: date-time` (UTC).
   - Errors: only `default: { $ref: '#/components/responses/Problem' }`.
   - Additive changes only (new fields optional). Renaming or removing a field is a breaking change: ask the owner.
2. **Database** (if needed) — the `db-change` skill: migration + `queries/<area>.sql`.
3. `task generate`. Compile errors now show exactly which handler methods are missing or changed.
4. **Handler** in the area's file in `services/api/internal/api/` (shape in `services/api/CLAUDE.md`):
   auth → tier (`access.Allowed`) or roles (`requireRoles`) → validate and clamp every input → query → map to the response.
   Staff writes: `s.tx` + `audit.Write` in the same transaction. Pure logic (calculations, rules) goes in `internal/<domain>`
   with unit tests, not in the handler.
5. **Tests** in `services/api/internal/api/<area>_integration_test.go`: the happy path plus the negatives
   (anonymous → 401, wrong tier → `FEATURE_LOCKED` and no data, another user's id → 404, wrong staff role → 403, bad input → 400).
6. `task check` and `task test:integration`. Then `task api:reload` and call it: `curl -s localhost:8080/v1/... | jq`.
7. Update `docs/architecture/API_GUIDELINES.md` if you added a problem code, and `DATA_MODEL.md` if tables changed.
8. The UIs: `packages/api-client` was regenerated in step 3; continue with `add-web-page` or `add-admin-page`.

## Don't
- Don't edit `api.gen.go`, `internal/dbq/*` or `packages/api-client/src/schema.d.ts` by hand.
- Don't check tiers anywhere but `internal/access`, and don't return locked data "for the UI to hide".
- Don't return `err` for expected failures; return `fail[...](problem)` with a nil error.
