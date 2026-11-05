import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link, useSearchParams } from "react-router";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import { api, canGrant, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Input, Notice, Page, Select, Td, Th } from "./ui";
import { ACTIVITIES, METALS, addDays, downloadCsv, todayTehran } from "./dates";

type Plan = "free" | "silver" | "gold";

/**
 * Users, searchable by mobile (Persian or Latin digits), name, company or id, and filtered by the plan they hold, a
 * metal or activity from the sign-up form, or province; 50 a page; the filtered list as an Excel (CSV) file.
 * Identities themselves live in Keycloak.
 */
export function UsersPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? ""); // ?q= from the visitor stats
  const [f, setF] = useState({ plan: "" as Plan | "", metal: "", activity: "", province: "", smsMetal: "", expiresWithin: "", joinedFrom: "", joinedTo: "", source: "" });
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState<unknown>(null);
  const filter = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1); };
  const query = { ...(q ? { q } : {}), ...(f.plan ? { plan: f.plan } : {}), ...(f.metal ? { metal: f.metal } : {}),
    ...(f.activity ? { activity: f.activity } : {}), ...(f.province ? { province: f.province } : {}),
    // Segments for the sales team's own bulk SMS (client, 2026-11-05): export the list, send from the SMS panel.
    ...(f.smsMetal ? { smsMetal: f.smsMetal } : {}), ...(f.expiresWithin ? { expiresWithin: Number(f.expiresWithin) } : {}),
    ...(f.joinedFrom ? { joinedFrom: f.joinedFrom } : {}), ...(f.joinedTo ? { joinedTo: f.joinedTo } : {}), ...(f.source ? { source: f.source } : {}) };
  const res = useQuery({
    queryKey: ["admin", "users", query, page],
    queryFn: async () => unwrap(await api.GET("/v1/admin/users", { params: { query: { ...query, page } } })),
  });
  const list = { data: res.data?.items };
  const pages = Math.max(1, Math.ceil((res.data?.total ?? 0) / 50));
  const n = (v: number) => formatNumber(v, locale);
  const exportCsv = async () => {
    setExportError(null);
    try {
      await downloadCsv("/v1/admin/users/export", Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), "users.csv");
    } catch (e) {
      setExportError(e);
    }
  };
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const qc = useQueryClient();
  // Admin only: deletes the Keycloak account and the personal details; orders and payments stay, without a name.
  const remove = useMutation({
    mutationFn: async (id: string) => ensureOk(await api.DELETE("/v1/admin/users/{id}", { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  return (
    <Page title={t("users.title")} hint={t("users.hint")}>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("users.search")} className="w-72" />
        <Select value={f.plan} onChange={(e) => filter({ plan: e.target.value as Plan | "" })} aria-label={t("subs.plan")}>
          <option value="">{t("act.allPlans")}</option>
          {(["free", "silver", "gold"] as const).map((p) => <option key={p} value={p}>{t(`plan.${p}`)}</option>)}
        </Select>
        <Select value={f.metal} onChange={(e) => filter({ metal: e.target.value })} aria-label={t("users.metal")}>
          <option value="">{t("users.allMetals")}</option>
          {METALS.map((m) => <option key={m} value={m}>{t(`signup.metal.${m}`)}</option>)}
        </Select>
        <Select value={f.activity} onChange={(e) => filter({ activity: e.target.value })} aria-label={t("act.activity")}>
          <option value="">{t("act.allActivities")}</option>
          {ACTIVITIES.map((a) => <option key={a} value={a}>{t(`signup.activity.${a}`)}</option>)}
        </Select>
        <Select value={f.province} onChange={(e) => filter({ province: e.target.value })} aria-label={t("users.province")}>
          <option value="">{t("users.allProvinces")}</option>
          {res.data?.provinces.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Button type="button" tone="ghost" onClick={() => setMore(!more)}>{more ? t("users.lessFilters") : t("users.moreFilters")}</Button>
        <span className="flex-1" />
        <Button type="button" tone="gold" onClick={exportCsv}>⬇ {t("act.export")}</Button>
      </div>
      {more && (
        <Card className="flex flex-wrap items-end gap-3 p-3">
          <label className="space-y-1 text-xs text-text-2">
            <span className="block">{t("users.smsMetal")}</span>
            <Select value={f.smsMetal} onChange={(e) => filter({ smsMetal: e.target.value })}>
              <option value="">{t("users.any")}</option>
              {METALS.map((m) => <option key={m} value={m}>{t(`signup.metal.${m}`)}</option>)}
            </Select>
          </label>
          <label className="space-y-1 text-xs text-text-2">
            <span className="block">{t("users.expiresWithin")}</span>
            <Select value={f.expiresWithin} onChange={(e) => filter({ expiresWithin: e.target.value })}>
              <option value="">{t("users.any")}</option>
              {["3", "7", "14", "30"].map((d) => <option key={d} value={d}>{t("users.days", { n: n(Number(d)) })}</option>)}
            </Select>
          </label>
          <label className="space-y-1 text-xs text-text-2">
            <span className="block">{t("users.joined")}</span>
            <Select value={f.joinedFrom ? String(Math.round((Date.parse(todayTehran()) - Date.parse(f.joinedFrom)) / 864e5) + 1) : ""}
              onChange={(e) => filter({ joinedFrom: e.target.value ? addDays(todayTehran(), -(Number(e.target.value) - 1)) : "", joinedTo: "" })}>
              <option value="">{t("users.any")}</option>
              {["1", "7", "30", "90"].map((d) => <option key={d} value={d}>{d === "1" ? t("range.today") : t("users.lastDays", { n: n(Number(d)) })}</option>)}
            </Select>
          </label>
          <label className="space-y-1 text-xs text-text-2">
            <span className="block">{t("users.source")}</span>
            <Input dir="ltr" placeholder="google, instagram, utm:insta" value={f.source} onChange={(e) => filter({ source: e.target.value.trim() })} className="w-44" />
          </label>
          <p className="basis-full text-xs text-text-3">{t("users.segmentsHint")}</p>
        </Card>
      )}
      {exportError != null && <Notice tone="error">{errorText(exportError, t)}</Notice>}
      {remove.isSuccess && <Notice tone="ok">{t("users.deleted")}</Notice>}
      {remove.isError && (
        <Notice tone="error">
          {errorText(remove.error, t, { CONFLICT: "users.deleteConflict", UPSTREAM_UNAVAILABLE: "users.deleteNotSetUp" })}
        </Notice>
      )}
      {/* Phones: one card per user (client, 2026-11-05). */}
      <Card className="md:hidden">
        <ul className="divide-y divide-border">
          {list.data?.length === 0 && <li className="p-3 text-sm text-text-2">{t("table.empty")}</li>}
          {list.data?.map((u) => (
            <li key={u.id} className="space-y-1 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <b>{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</b>
                  <a href={`tel:${u.phone ?? u.username}`} dir="ltr" className="block text-xs text-text-2">{u.phone ?? u.username}</a>
                </div>
                <Badge tone={u.currentPlan === "gold" ? "gold" : "gray"}>{t(`plan.${u.currentPlan}`)}</Badge>
              </div>
              {(u.company || u.metals?.length) ? (
                <div className="text-xs text-text-3">{[u.company, u.metals?.map((m) => t(`signup.metal.${m}`, m)).join(locale === "fa" ? "، " : ", ")].filter(Boolean).join(" · ")}</div>
              ) : null}
              <div className="flex gap-3 pt-1 text-xs">
                <Link to={`/activity/${u.id}`} className="font-bold text-gold-dark">{t("users.activity")}</Link>
                <Link to={`/subscriptions?user=${u.id}`} className="text-gold-dark">{t("users.grant")}</Link>
                <Link to={`/orders?user=${u.id}`} className="text-text-2">{t("users.orders")}</Link>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("users.user")}</Th><Th>{t("account.name")}</Th><Th>{t("users.signup")}</Th><Th>{t("subs.plan")}</Th><Th>{t("users.lastSeen")}</Th><Th /></tr>
          </thead>
          <tbody>
            {list.data?.length === 0 && <tr><Td className="text-text-2">{t("table.empty")}</Td></tr>}
            {list.data?.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <Td>
                  <div dir="ltr" className="font-bold">{u.phone ?? u.username}</div>
                  <code className="text-xs text-text-3" dir="ltr">{u.id}</code>
                </Td>
                <Td>
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                  {u.company && <div className="text-xs text-text-2">{t("users.company")}: {u.company}</div>}
                </Td>
                <Td className="text-xs">
                  {u.activity || u.metals?.length || u.province ? (
                    <>
                      {u.activity && <div className="font-bold">{t(`signup.activity.${u.activity}`, u.activity)}</div>}
                      {u.metals?.length ? <div className="text-text-2">{u.metals.map((m) => t(`signup.metal.${m}`, m)).join(locale === "fa" ? "، " : ", ")}</div> : null}
                      {u.province && <div className="text-text-3">{u.province}</div>}
                    </>
                  ) : "—"}
                </Td>
                <Td>
                  <Badge tone={u.currentPlan === "gold" ? "gold" : u.currentPlan === "silver" ? "gray" : "gray"}>{t(`plan.${u.currentPlan}`)}</Badge>
                  {u.currentEndsAt && <div className="mt-1 text-xs text-text-3">{formatDate(u.currentEndsAt, locale)}</div>}
                  {u.deletedAt ? <Badge tone="red">{t("users.deletedBadge")}</Badge> : u.blocked && <Badge tone="red">{t("users.blocked")}</Badge>}
                </Td>
                <Td className="text-xs text-text-2">{formatDate(u.lastSeenAt, locale, true)}</Td>
                <Td>
                  <div className="flex gap-3 text-xs">
                    <Link to={`/activity/${u.id}`} className="font-bold text-gold-dark hover:underline">{t("users.activity")}</Link>
                    <Link to={`/subscriptions?user=${u.id}`} className="text-gold-dark hover:underline">{t("users.grant")}</Link>
                    <Link to={`/orders?user=${u.id}`} className="text-text-2 hover:underline">{t("users.orders")}</Link>
                    {!u.deletedAt && canGrant(roles.data ?? []) && (
                      <Button
                        type="button"
                        tone="danger"
                        disabled={remove.isPending}
                        onClick={() => window.confirm(t("users.deleteConfirm", { user: u.phone ?? u.username })) && remove.mutate(u.id)}
                      >
                        {t("users.delete")}
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {res.data && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-2">{t("users.total", { n: n(res.data.total) })}</span>
          <span className="flex-1" />
          <Button type="button" tone="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("page.prev")}</Button>
          <span className="tabular-nums">{t("page.of", { page: n(page), pages: n(pages) })}</span>
          <Button type="button" tone="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("page.next")}</Button>
        </div>
      )}
    </Page>
  );
}
