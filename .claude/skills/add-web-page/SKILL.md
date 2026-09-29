---
name: add-web-page
description: Add or change a page or component on the public website (apps/web, Next.js), in Persian and English, mobile first. Use for any public-site UI work.
---

# Add or change a website page

Read `apps/web/CLAUDE.md` first. Closest examples: `apps/web/src/app/[locale]/auctions/page.tsx` (data + locked part),
`calculator/` (a form with server actions), `faq/` (client-side interactivity), `about/` (a CMS page via `StaticPage`).
Look at the design for the page in `docs/design/screenshots/summary-draft/` before building it.

## Steps
1. **Data**: the API endpoint exists (else `add-api-endpoint` first). Add a function to `apps/web/src/lib/<area>.ts`
   (`import "server-only"`): public data `api.GET(..., { next: { revalidate: N } })`; per-user data `callerApi()` + `cache: "no-store"`.
   Types from `Schemas["..."]` of `@alanfelez/api-client`.
2. **Page**: `apps/web/src/app/[locale]/<path>/page.tsx` with `generateMetadata` → `seo(locale, "/<path>", {...})`,
   `setRequestLocale(locale)`, translations with `getTranslations("<namespace>")`, and an "API down" message when data is null.
3. **Interactivity** only in a small `"use client"` component under `src/components/<area>/` that exports components only.
   Forms → server action in `actions.ts` next to the page (pattern: `contact/actions.ts`).
4. **Text**: add keys to **both** `apps/web/messages/fa.json` and `en.json` under one namespace. Persian copy from the client
   (docs/content, the Word files) is copied verbatim; if Persian copy is missing, ask instead of writing your own.
5. **Formatting**: `formatToman`, `formatDate`, `formatNumber`, `formatBp`, `formatTons` from `@alanfelez/ui/format`.
6. **Locked** content: `<Locked plan={data.requiredPlan ?? "gold"}>` when the API says `locked`.
7. **Navigation/SEO**: new public page → `src/lib/nav.ts`, `PAGES` in `src/app/sitemap.ts`, footer if it belongs there.
8. **Check**:
   - `pnpm --filter @alanfelez/web typecheck` (part of `task check`)
   - `task web:reload`, then in the browser pane: `http://localhost:3000/<path>` and `/en/<path>` (English is behind the
     `locale.en` flag; if `/en` redirects, turn it on locally with
     `docker compose exec postgres psql -U alanfelez alanfelez -c "UPDATE app.feature_flags SET enabled = true WHERE key = 'locale.en'"`
     and wait a minute for the cache), at 375 px and desktop width, signed out and signed in
     (Gold user: grant a plan in admin → users). No console errors (CSP violations show there).
   - Screenshot fa + en, phone + desktop for the PR.

## Don't
- No hard-coded text, no `left`/`right`/`ml-`/`mr-`/`pl-`/`pr-` classes, no floats for money, no external fonts/scripts/CDNs.
- No marketplace, «اعلام بار», seller contact or verified badges even if the design shows them (SCOPE §4).
- Never «قیمت قطعی» / «تضمین سود»; prices always show the source and the last-updated time.
