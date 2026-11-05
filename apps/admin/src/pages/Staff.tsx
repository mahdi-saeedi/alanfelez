import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import { RangePicker, type Range, lastDays } from "./dates";
import { api, canGrant, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Field, Input, Notice, Page, Select, Td, Th } from "./ui";

type Member = Schemas["StaffMember"];
const ROLES = ["staff", "support", "editor", "admin"] as const;

/**
 * Staff accounts (client 2026-11-03/04, owner OK'd): the admin creates an account with a username and a temporary
 * password and gives both to the person; at the first sign-in they choose their own password and set up two-step
 * sign-in (an authenticator app). Roles: view only (e.g. sales), support, editor, admin. Admin only; audited.
 */
export function StaffPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const admin = canGrant(roles.data ?? []);
  const list = useQuery({
    queryKey: ["admin", "staff"],
    enabled: admin,
    queryFn: async () => unwrap(await api.GET("/v1/admin/staff", {})).items,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "staff"] });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: { role?: string; enabled?: boolean } }) =>
      ensureOk(await api.PUT("/v1/admin/staff/{id}", { params: { path: { id } }, body })),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) =>
      ensureOk(await api.POST("/v1/admin/staff/{id}/password", { params: { path: { id } }, body: { password } })),
  });

  if (roles.isSuccess && !admin) return <Page title={t("staff.title")}><Notice tone="warn">{t("staff.adminOnly")}</Notice></Page>;
  return (
    <Page title={t("staff.title")} hint={t("staff.hint")}>
      <NewStaff onDone={refresh} />
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("staff.name")}</Th><Th>{t("staff.username")}</Th><Th>{t("staff.role")}</Th><Th>{t("staff.totp")}</Th><Th>{t("staff.created_at")}</Th><Th>{t("staff.actions")}</Th></tr>
          </thead>
          <tbody>
            {list.isLoading && <tr><Td className="text-text-2">{t("table.loading")}</Td></tr>}
            {list.data?.map((m: Member) => (
              <tr key={m.id} className={`border-t border-border ${m.enabled ? "" : "opacity-60"}`}>
                <Td className="font-bold">{m.firstName} {m.lastName}{!m.enabled && <span className="ms-2"><Badge tone="gray">{t("staff.disabled")}</Badge></span>}</Td>
                <Td dir="ltr" className="text-start">{m.username}</Td>
                <Td>
                  <Select value={m.role} disabled={update.isPending} onChange={(e) => update.mutate({ id: m.id, body: { role: e.target.value } })}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(`staff.roles.${r}`)}</option>)}
                  </Select>
                </Td>
                <Td>{m.totp ? <Badge tone="green">{t("staff.totpOn")}</Badge> : <Badge tone="gold">{t("staff.totpOff")}</Badge>}</Td>
                <Td className="text-xs">{formatDate(m.createdAt, locale)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" tone="ghost" onClick={() => {
                      const pw = prompt(t("staff.resetPrompt"));
                      if (pw) reset.mutate({ id: m.id, password: pw });
                    }}>{t("staff.reset")}</Button>
                    <Button type="button" tone={m.enabled ? "danger" : "ghost"} onClick={() => {
                      if (!m.enabled || confirm(t("staff.disableConfirm", { name: `${m.firstName} ${m.lastName}` }))) update.mutate({ id: m.id, body: { enabled: !m.enabled } });
                    }}>{m.enabled ? t("staff.disable") : t("staff.enable")}</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {(list.isError || update.isError || reset.isError) && <Notice tone="error">{errorText(list.error ?? update.error ?? reset.error, t)}</Notice>}
      {reset.isSuccess && <Notice tone="ok">{t("staff.resetDone")}</Notice>}
      <Notice tone="warn">{t("staff.howTo")}</Notice>
      <StaffWork />
    </Page>
  );
}

function NewStaff({ onDone }: { onDone: () => void }) {
  const t = useTranslate();
  const empty = { username: "", firstName: "", lastName: "", role: "staff", password: "" };
  const [v, setV] = useState(empty);
  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST("/v1/admin/staff", { body: v })),
    onSuccess: () => { setV(empty); onDone(); },
  });
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">{t("staff.new")}</h2>
      <form className="grid gap-3 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label={t("staff.firstName")}><Input required maxLength={60} value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} className="w-full" /></Field>
        <Field label={t("staff.lastName")}><Input required maxLength={60} value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} className="w-full" /></Field>
        <Field label={t("staff.username")} hint={t("staff.usernameHint")}>
          <Input required dir="ltr" pattern="[a-z][a-z0-9._\-]{2,29}" value={v.username} onChange={(e) => setV({ ...v, username: e.target.value.toLowerCase() })} className="w-full" />
        </Field>
        <Field label={t("staff.role")}>
          <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} className="w-full">
            {ROLES.map((r) => <option key={r} value={r}>{t(`staff.roles.${r}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("staff.password")} hint={t("staff.passwordHint")}>
          <Input required dir="ltr" minLength={10} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className="w-full" />
        </Field>
        <div className="md:col-span-5">
          <Button tone="gold" type="submit" disabled={create.isPending}>{create.isPending ? t("common.saving") : t("staff.create")}</Button>
        </div>
      </form>
      {create.isError && <Notice tone="error">{errorText(create.error, t, { CONFLICT: "staff.taken" })}</Notice>}
      {create.isSuccess && <Notice tone="ok">{t("staff.created")}</Notice>}
    </Card>
  );
}

/** What each staff member did in a period, from the audit log (client, 2026-11-05). */
function StaffWork() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [range, setRange] = useState<Range>(lastDays(30));
  const q = useQuery({
    queryKey: ["admin", "staff-work", range],
    queryFn: async () => unwrap(await api.GET("/v1/admin/staff-work", { params: { query: { from: range.from, to: range.to } } })).items,
  });
  const people = new Map<string, { name: string; total: number; last: string; actions: { action: string; count: number }[] }>();
  for (const r of q.data ?? []) {
    const p = people.get(r.actorId) ?? { name: r.name, total: 0, last: r.lastAt, actions: [] };
    p.total += r.count;
    if (r.lastAt > p.last) p.last = r.lastAt;
    p.actions.push({ action: r.action, count: r.count });
    people.set(r.actorId, p);
  }
  const label = (a: string) => (t(`work.${a}`) === `work.${a}` ? a : t(`work.${a}`));
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">{t("work.title")}</h2>
      <p className="text-xs text-text-3">{t("work.hint")}</p>
      <RangePicker value={range} onChange={setRange} locale={locale} />
      {q.isError && <Notice tone="error">{errorText(q.error, t)}</Notice>}
      {people.size === 0 && q.isSuccess && <p className="text-sm text-text-3">{t("work.none")}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {[...people.entries()].sort((a, b) => b[1].total - a[1].total).map(([id, p]) => (
          <div key={id} className="rounded-lg border border-border p-3">
            <div className="flex justify-between gap-2"><b dir="ltr">{p.name}</b><span className="text-xs text-text-3">{t("work.last", { date: formatDate(p.last, locale, true) })}</span></div>
            <ul className="mt-2 space-y-1 text-sm">
              {p.actions.slice(0, 8).map((a) => (
                <li key={a.action} className="flex justify-between gap-2"><span>{label(a.action)}</span><b className="tabular-nums">{formatNumber(a.count, locale)}</b></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
