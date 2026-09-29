# Staff admin panel (`apps/admin`, Refine 5 + React + Vite)

A single-page app for staff (roles `admin`, `editor`, `support`). Staff sign in with Keycloak (OIDC PKCE, mandatory TOTP);
every call goes to the Go API with the staff token. The **API is the security boundary**: hiding a button here is convenience,
the role check in Go (`requireRoles`) is what protects the data. Served by `server.mjs` (static files, runtime `/config.js`,
security headers). Check your work with `pnpm --filter @alanfelez/admin typecheck`, then `task admin:reload` and the page at
http://localhost:5173 signed in as a local staff user (`docs/guides/LOCAL_SETUP.md`).

## Where things are
| Path | What |
|---|---|
| `src/main.tsx` | Routes (`<Route path="/thing" element={<ThingPage />} />`) |
| `src/pages/Layout.tsx` | Sidebar: the `NAV` groups. A new page gets an entry here |
| `src/pages/<Area>.tsx` | One file per area: `Prices`, `Bulk`, `Auctions`, `Articles`, `Faq`, `Pages`, `Support`, `Users`, `Settings`… |
| `src/pages/ui.tsx` | The admin UI kit: `Page`, `Card`, `Button` (tones dark/gold/ghost/danger), `Input`, `Select`, `Textarea`, `Field`, `Notice`, `Badge`, `Th`, `Td` |
| `src/pages/RichEditor.tsx` | TipTap editor for CMS rich text (the API sanitizes what it saves) |
| `src/api.ts` | Typed client `api` (adds the token and language), `unwrap`, `ensureOk`, `errorText`, role helpers (`canWritePrices`, `canWriteContent`, `canAnswerSupport`, `canGrant`, `canEditSettings`) |
| `src/i18n.ts` | **All admin UI text**, `fa` and `en` in one file. Add every key to both |
| `src/amount.ts` | Toman ⇄ Rial input helpers (staff type Toman, the API stores Rial) |

## The shape of a page (copy `src/pages/Faq.tsx` or `src/pages/Auctions.tsx`)
```tsx
export function ThingsPage() {
  const t = useTranslate();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canWriteContent(roles.data ?? []);                    // hide write controls for read-only staff
  const list = useQuery({ queryKey: ["admin", "things"], queryFn: async () => unwrap(await api.GET("/v1/admin/things", {})) });
  const save = useMutation({
    mutationFn: async (body: Schemas["AdminThingInput"]) => unwrap(await api.POST("/v1/admin/things", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "things"] }),
  });
  return (
    <Page title={t("things.title")} hint={t("things.hint")}>
      {save.error && <Notice tone="error">{errorText(save.error, t, { CONFLICT: "things.slugTaken" })}</Notice>}
      …
    </Page>
  );
}
```
- Data: `@tanstack/react-query` + the typed `api` client. `unwrap` for calls with a body, `ensureOk` for 204s.
- Errors: `errorText(err, t, overrides)` turns the problem **code** into a translated message (`error.<CODE>` keys, or a
  page-specific override). Never show the API's English `detail` to staff.
- Money: staff enter **Toman**; convert with `src/amount.ts` and send Rial. Show with `formatToman` from `@alanfelez/ui/format`.
- Destructive actions (delete, refund, grant) ask for confirmation and say what will happen.
- The admin is RTL by default with an English toggle: logical classes only (`ms-`, `me-`, `ps-`, `pe-`, `text-start`).

## Adding a page
1. The endpoint exists in `contracts/openapi.yaml` (under `/v1/admin/...`, role-checked and audited in Go) and `task generate` ran.
2. `src/pages/Thing.tsx` using the kit in `ui.tsx`; route in `main.tsx`; sidebar entry in `Layout.tsx` `NAV`; texts in `i18n.ts` (fa + en).
3. Typecheck, reload, try it as `local-editor`. The Go integration test proves the other roles get 403 (a hidden button is not protection).
