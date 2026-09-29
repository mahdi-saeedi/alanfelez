---
name: add-admin-page
description: Add or change a page in the staff admin panel (apps/admin, Refine + React). Use for any admin UI work: lists, forms, editors, bulk entry.
---

# Add or change an admin page

Read `apps/admin/CLAUDE.md` first. Closest examples: `apps/admin/src/pages/Faq.tsx` (list + edit form + rich text),
`Auctions.tsx` (paste a table, check, save), `Support.tsx` (list + detail), `Settings.tsx` (a settings form).

## Steps
1. The `/v1/admin/...` endpoint exists with a role check and audit in Go (else `add-api-endpoint` first; staff writes
   **must** be audited). `task generate` ran, so `Schemas["Admin..."]` types exist.
2. `apps/admin/src/pages/<Thing>.tsx`: `useQuery` + `unwrap(await api.GET(...))`, `useMutation` for writes, invalidate the query
   key on success, `errorText(err, t, overrides)` for errors, kit components from `./ui`.
3. Hide write controls for roles that can't write (`canWriteContent`, `canWritePrices`, `canAnswerSupport`, `canGrant` from `../api`).
4. Money: inputs in Toman via `toMinor`/`fromMinor` (`src/amount.ts`); display with `formatToman`.
5. Route in `src/main.tsx`, sidebar entry in `src/pages/Layout.tsx` (`NAV`), texts in `src/i18n.ts` (fa **and** en).
6. Confirm destructive actions (`window.confirm` with a clear message, like the existing delete buttons).
7. Check: `pnpm --filter @alanfelez/admin typecheck`, `task admin:reload`, sign in at http://localhost:5173 as `local-editor`
   (`docs/guides/LOCAL_SETUP.md`), do the full flow, and confirm the change shows on the website if it's public content.
