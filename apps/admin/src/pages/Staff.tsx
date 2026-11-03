import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import type { Schemas } from "@alanfelez/api-client";
import { api, canGrant, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Field, Input, Notice, Page, Td, Th } from "./ui";

type Role = Schemas["StaffRole"];
type Member = Schemas["StaffMember"];
const ROLES: Role[] = ["sales", "support", "editor", "admin"];

/** A random 14-character password (no look-alike characters), for the admin to hand over. */
function newPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function RoleBoxes({ value, onChange }: { value: Role[]; onChange: (r: Role[]) => void }) {
  const t = useTranslate();
  return (
    <div className="flex flex-wrap gap-3">
      {ROLES.map((r) => (
        <label key={r} className="flex items-start gap-1.5 text-sm">
          <input type="checkbox" className="mt-1" checked={value.includes(r)}
            onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} />
          <span><b>{t(`staff.role.${r}`)}</b><span className="block text-xs text-text-3">{t(`staff.roleHint.${r}`)}</span></span>
        </label>
      ))}
    </div>
  );
}

/**
 * «پرسنل» (client 2026-11-03, owner OK by phone): admins create staff accounts with a username and password, pick
 * their roles, disable them or set a new password. Staff sign in at the admin with that username and password and then
 * set up the code app (two-step sign-in is required). The accounts live in Keycloak; the API checks every role.
 */
export function StaffPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const admin = canGrant(roles.data ?? []);
  const list = useQuery({ queryKey: ["admin", "staff"], queryFn: async () => unwrap(await api.GET("/v1/admin/staff", {})).items });
  const empty = { username: "", firstName: "", lastName: "", password: newPassword(), temporary: true, roles: ["sales"] as Role[] };
  const [form, setForm] = useState(empty);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; firstName: string; lastName: string; roles: Role[]; enabled: boolean } | null>(null);
  const [pw, setPw] = useState<{ id: string; username: string; password: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "staff"] });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST("/v1/admin/staff", {
      body: { username: form.username.trim().toLowerCase(), firstName: form.firstName.trim(), lastName: form.lastName.trim(), password: form.password, temporary: form.temporary, roles: form.roles },
    })),
    onSuccess: (m) => { setCreated({ username: m.username, password: form.password }); setForm({ ...empty, password: newPassword() }); void refresh(); },
  });
  const update = useMutation({
    mutationFn: async (e: NonNullable<typeof editing>) => unwrap(await api.PUT("/v1/admin/staff/{id}", {
      params: { path: { id: e.id } }, body: { firstName: e.firstName.trim(), lastName: e.lastName.trim(), roles: e.roles, enabled: e.enabled },
    })),
    onSuccess: () => { setEditing(null); void refresh(); },
  });
  const setPassword = useMutation({
    mutationFn: async (p: NonNullable<typeof pw>) => ensureOk(await api.POST("/v1/admin/staff/{id}/password", { params: { path: { id: p.id } }, body: { password: p.password, temporary: true } })),
    onSuccess: (_, p) => { setCreated({ username: p.username, password: p.password }); setPw(null); },
  });
  const err = create.error ?? update.error ?? setPassword.error ?? list.error;
  const name = (m: Member) => [m.firstName, m.lastName].filter(Boolean).join(" ") || "—";
  const validNew = /^[a-z0-9._-]{3,40}$/.test(form.username.trim().toLowerCase()) && !/^[0-9+]+$/.test(form.username.trim())
    && form.firstName.trim() !== "" && form.password.length >= 10 && form.roles.length > 0;

  return (
    <Page title={t("staff.title")} hint={t("staff.hint")}>
      {err && <Notice tone="error">{errorText(err, t, { CONFLICT: "staff.conflict", UPSTREAM_UNAVAILABLE: "staff.notSetUp" })}</Notice>}
      {created && (
        <Notice tone="ok">
          <div className="space-y-1">
            <b>{t("staff.created")}</b>
            <div>{t("staff.username")}: <code dir="ltr" className="font-bold">{created.username}</code> · {t("staff.password")}: <code dir="ltr" className="font-bold">{created.password}</code></div>
            <div className="text-xs">{t("staff.handOver")}</div>
          </div>
        </Notice>
      )}

      {admin && (
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-bold">{t("staff.new")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("staff.username")} hint={t("staff.usernameHint")}>
              <Input dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="sales.ali" className="w-full" />
            </Field>
            <Field label={t("staff.firstName")}><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full" /></Field>
            <Field label={t("staff.lastName")}><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full" /></Field>
            <Field label={t("staff.password")} hint={t("staff.passwordHint")}>
              <span className="flex gap-1">
                <Input dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full font-mono" />
                <Button type="button" tone="ghost" onClick={() => setForm({ ...form, password: newPassword() })}>{t("staff.generate")}</Button>
              </span>
            </Field>
          </div>
          <RoleBoxes value={form.roles} onChange={(r) => setForm({ ...form, roles: r })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.temporary} onChange={(e) => setForm({ ...form, temporary: e.target.checked })} />
            {t("staff.temporary")}
          </label>
          <Button type="button" tone="gold" disabled={!validNew || create.isPending} onClick={() => create.mutate()}>{t("staff.create")}</Button>
        </Card>
      )}

      <Card>
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("staff.username")}</Th><Th>{t("staff.name")}</Th><Th>{t("staff.roles")}</Th><Th>{t("staff.twoStep")}</Th><Th>{t("staff.status")}</Th><Th>{t("staff.since")}</Th><Th /></tr>
          </thead>
          <tbody>
            {list.data?.map((m) => editing?.id === m.id ? (
              <tr key={m.id} className="border-t border-border bg-gold/5">
                <Td dir="ltr" className="font-bold">{m.username}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Input value={editing.firstName} onChange={(e) => setEditing({ ...editing, firstName: e.target.value })} className="w-28" aria-label={t("staff.firstName")} />
                    <Input value={editing.lastName} onChange={(e) => setEditing({ ...editing, lastName: e.target.value })} className="w-28" aria-label={t("staff.lastName")} />
                  </div>
                </Td>
                <Td colSpan={3}><RoleBoxes value={editing.roles} onChange={(r) => setEditing({ ...editing, roles: r })} /></Td>
                <Td>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
                    {t("staff.mayLogin")}
                  </label>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button type="button" tone="gold" disabled={!editing.firstName.trim() || !editing.roles.length || update.isPending} onClick={() => update.mutate(editing)}>{t("staff.save")}</Button>
                    <Button type="button" tone="ghost" onClick={() => setEditing(null)}>{t("staff.cancel")}</Button>
                  </div>
                </Td>
              </tr>
            ) : (
              <tr key={m.id} className={`border-t border-border ${m.enabled ? "" : "opacity-60"}`}>
                <Td dir="ltr" className="font-bold">{m.username}</Td>
                <Td>{name(m)}</Td>
                <Td><div className="flex flex-wrap gap-1">{m.roles.map((r) => <Badge key={r} tone={r === "admin" ? "gold" : "gray"}>{t(`staff.role.${r}`)}</Badge>)}</div></Td>
                <Td>{m.totp ? <Badge tone="green">{t("staff.totpOn")}</Badge> : <Badge tone="red">{t("staff.totpOff")}</Badge>}</Td>
                <Td>{m.enabled ? <Badge tone="green">{t("staff.active")}</Badge> : <Badge tone="red">{t("staff.disabled")}</Badge>}</Td>
                <Td className="text-xs text-text-2">{m.createdAt ? formatDate(m.createdAt, locale) : "—"}</Td>
                <Td>
                  {admin && (
                    <div className="flex gap-1">
                      <Button type="button" tone="ghost" onClick={() => setEditing({ id: m.id, firstName: m.firstName ?? "", lastName: m.lastName ?? "", roles: m.roles, enabled: m.enabled })}>{t("staff.edit")}</Button>
                      <Button type="button" tone="ghost" onClick={() => setPw({ id: m.id, username: m.username, password: newPassword() })}>{t("staff.newPassword")}</Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {pw && (
        <Card className="space-y-3 border-gold p-4">
          <h2 className="text-sm font-bold">{t("staff.newPasswordFor", { user: pw.username })}</h2>
          <span className="flex max-w-md gap-1">
            <Input dir="ltr" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} className="w-full font-mono" aria-label={t("staff.password")} />
            <Button type="button" tone="ghost" onClick={() => setPw({ ...pw, password: newPassword() })}>{t("staff.generate")}</Button>
          </span>
          <p className="text-xs text-text-2">{t("staff.newPasswordHint")}</p>
          <div className="flex gap-1">
            <Button type="button" tone="gold" disabled={pw.password.length < 10 || setPassword.isPending} onClick={() => setPassword.mutate(pw)}>{t("staff.setPassword")}</Button>
            <Button type="button" tone="ghost" onClick={() => setPw(null)}>{t("staff.cancel")}</Button>
          </div>
        </Card>
      )}
      <p className="text-xs text-text-3">{t("staff.note")}</p>
    </Page>
  );
}
