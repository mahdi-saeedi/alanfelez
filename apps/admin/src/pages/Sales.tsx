import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetIdentity, useGetLocale, useTranslate } from "@refinedev/core";
import { Link, useSearchParams } from "react-router";
import { formatDate, formatNumber, formatToman, type Locale } from "@alanfelez/ui/format";
import type { Schemas } from "@alanfelez/api-client";
import { api, canSell, currentRoles, errorText, unwrap } from "../api";
import { Badge, Button, Card, Input, Notice, Page, Select, Td, Th } from "./ui";
import { DayPicker, RangePicker, type Range, downloadCsv, lastDays, noonOf, todayTehran } from "./dates";

type Stage = Schemas["LeadStage"];
type Kind = Schemas["SalesNoteKind"];
type Outcome = Schemas["CallOutcome"];
const STAGES: Stage[] = ["new", "contacted", "interested", "not_interested", "customer"];
const OUTCOMES: Outcome[] = ["answered", "no_answer", "call_back"];
const stageTone = (s?: Stage) => (s === "customer" ? "green" : s === "interested" ? "gold" : s === "not_interested" ? "red" : "gray");

export function StageBadge({ stage }: { stage?: Stage }) {
  const t = useTranslate();
  if (!stage) return <span className="text-xs text-text-3">—</span>;
  return <span className="whitespace-nowrap"><Badge tone={stageTone(stage)}>{t(`lead.${stage}`)}</Badge></span>;
}

/** A phone number that dials on a phone. */
export function Phone({ username }: { username: string }) {
  return <a href={`tel:${username}`} dir="ltr" className="font-bold hover:underline">{username}</a>;
}

/**
 * The sales card on a user's profile (client 2026-11-03): stage, who looks after the customer, the next call, and the
 * notes and calls. Sales staff and admins write; every staff member reads.
 */
export function SalesBox({ userId }: { userId: string }) {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canSell(roles.data ?? []);
  const card = useQuery({ queryKey: ["admin", "sales", userId], queryFn: async () => unwrap(await api.GET("/v1/admin/sales/{id}", { params: { path: { id: userId } } })) });
  const staff = useQuery({ queryKey: ["admin", "staff"], queryFn: async () => unwrap(await api.GET("/v1/admin/staff", {})).items, retry: false });
  const lead = card.data?.lead;
  const [edit, setEdit] = useState<{ stage: Stage; ownerId: string; nextAt: string } | null>(null);
  const [note, setNote] = useState<{ kind: Kind; outcome: Outcome | ""; body: string }>({ kind: "call", outcome: "answered", body: "" });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin", "sales"] }); };
  const saveLead = useMutation({
    mutationFn: async (e: NonNullable<typeof edit>) => unwrap(await api.PUT("/v1/admin/sales/{id}/lead", {
      params: { path: { id: userId } }, body: { stage: e.stage, ...(e.ownerId ? { ownerId: e.ownerId } : {}), ...(e.nextAt ? { nextAt: e.nextAt } : {}) },
    })),
    onSuccess: () => { setEdit(null); refresh(); },
  });
  const addNote = useMutation({
    mutationFn: async () => unwrap(await api.POST("/v1/admin/sales/{id}/notes", {
      params: { path: { id: userId } },
      body: { kind: note.kind, ...(note.kind !== "note" && note.outcome ? { outcome: note.outcome } : {}), ...(note.body.trim() ? { body: note.body.trim() } : {}) },
    })),
    onSuccess: () => { setNote({ ...note, body: "" }); refresh(); },
  });
  const cur = edit ?? { stage: lead?.stage ?? "new", ownerId: lead?.ownerId ?? "", nextAt: lead?.nextAt ?? "" };
  const editing = edit !== null;
  const err = saveLead.error ?? addNote.error ?? card.error;
  const sellers = (staff.data ?? []).filter((m) => m.enabled && (m.roles.includes("sales") || m.roles.includes("admin")));

  return (
    <Card>
      <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm font-bold">
        {t("sales.card")}
        {lead && <span className="text-xs font-normal text-text-3">{t("sales.updated", { who: lead.updatedBy, when: formatDate(lead.updatedAt, locale, true) })}</span>}
      </h2>
      <div className="grid gap-4 p-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-3">
          {err && <Notice tone="error">{errorText(err, t)}</Notice>}
          <label className="block space-y-1 text-sm">
            <span className="font-bold">{t("sales.stage")}</span>
            <Select disabled={!writable} value={cur.stage} onChange={(e) => setEdit({ ...cur, stage: e.target.value as Stage })} className="w-full">
              {STAGES.map((s) => <option key={s} value={s}>{t(`lead.${s}`)}</option>)}
            </Select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-bold">{t("sales.owner")}</span>
            <Select disabled={!writable} value={cur.ownerId} onChange={(e) => setEdit({ ...cur, ownerId: e.target.value })} className="w-full">
              <option value="">{lead?.ownerName && !sellers.some((m) => m.id === lead.ownerId) ? lead.ownerName : t("sales.nobody")}</option>
              {sellers.map((m) => <option key={m.id} value={m.id}>{[m.firstName, m.lastName].filter(Boolean).join(" ") || m.username}</option>)}
            </Select>
          </label>
          <div className="space-y-1 text-sm">
            <span className="font-bold">{t("sales.next")}</span>
            <div className="flex flex-wrap items-center gap-1">
              {cur.nextAt ? (
                <>
                  <DayPicker value={cur.nextAt} max="2099-12-31" locale={locale} label={t("sales.next")} onChange={(d) => writable && setEdit({ ...cur, nextAt: d })} />
                  {writable && <Button type="button" tone="ghost" onClick={() => setEdit({ ...cur, nextAt: "" })}>{t("sales.noNext")}</Button>}
                </>
              ) : writable ? (
                <>
                  {[1, 3, 7].map((n) => {
                    const d = new Date(`${todayTehran()}T12:00:00Z`);
                    d.setUTCDate(d.getUTCDate() + n);
                    return <Button key={n} type="button" tone="ghost" onClick={() => setEdit({ ...cur, nextAt: d.toISOString().slice(0, 10) })}>{t("sales.inDays", { n: formatNumber(n, locale) })}</Button>;
                  })}
                </>
              ) : <span className="text-text-3">—</span>}
            </div>
          </div>
          {editing && writable && (
            <div className="flex gap-1">
              <Button type="button" tone="gold" disabled={saveLead.isPending} onClick={() => saveLead.mutate(cur)}>{t("sales.save")}</Button>
              <Button type="button" tone="ghost" onClick={() => setEdit(null)}>{t("staff.cancel")}</Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {writable && (
            <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap gap-2">
                <Select value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value as Kind })} aria-label={t("sales.kind")}>
                  {(["call", "renewal_call", "feedback_call", "note"] as Kind[]).map((k) => <option key={k} value={k}>{t(`sales.kind.${k}`)}</option>)}
                </Select>
                {note.kind !== "note" && (
                  <Select value={note.outcome} onChange={(e) => setNote({ ...note, outcome: e.target.value as Outcome })} aria-label={t("sales.outcome")}>
                    {OUTCOMES.map((o) => <option key={o} value={o}>{t(`call.${o}`)}</option>)}
                  </Select>
                )}
              </div>
              <textarea value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} rows={2} maxLength={2000}
                placeholder={t("sales.notePlaceholder")} className="w-full rounded-lg border border-border bg-surface p-2 text-sm" />
              <Button type="button" tone="dark" disabled={addNote.isPending || (note.kind === "note" && !note.body.trim())} onClick={() => addNote.mutate()}>{t("sales.add")}</Button>
            </div>
          )}
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {card.data?.notes.length === 0 && <li className="text-text-3">{t("sales.noNotes")}</li>}
            {card.data?.notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-border p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-2">
                  <Badge tone={n.kind === "note" ? "gray" : "gold"}>{t(`sales.kind.${n.kind}`)}</Badge>
                  {n.outcome && <Badge tone={n.outcome === "answered" ? "green" : "gray"}>{t(`call.${n.outcome}`)}</Badge>}
                  <span>{n.author}</span>
                  <span>{formatDate(n.createdAt, locale, true)}</span>
                </div>
                {n.body && <p className="mt-1 whitespace-pre-line">{n.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** One row's quick "I called" form in the call lists. */
function CallForm({ userId, kind, onDone }: { userId: string; kind: Kind; onDone: () => void }) {
  const t = useTranslate();
  const [outcome, setOutcome] = useState<Outcome>("answered");
  const [body, setBody] = useState("");
  const save = useMutation({
    mutationFn: async () => unwrap(await api.POST("/v1/admin/sales/{id}/notes", {
      params: { path: { id: userId } }, body: { kind, outcome, ...(body.trim() ? { body: body.trim() } : {}) },
    })),
    onSuccess: onDone,
  });
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} aria-label={t("sales.outcome")}>
        {OUTCOMES.map((o) => <option key={o} value={o}>{t(`call.${o}`)}</option>)}
      </Select>
      <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("calls.what")} className="w-48" maxLength={2000} />
      <Button type="button" tone="gold" disabled={save.isPending} onClick={() => save.mutate()}>{t("calls.save")}</Button>
      {save.isError && <span className="text-xs text-down">{errorText(save.error, t)}</span>}
    </div>
  );
}

type Tab = "followups" | "renewal" | "feedback";

/**
 * «تماس‌ها» (client 2026-11-03): today's follow-ups, plans ending in 2–4 days (renewal calls) and plans bought 14–16
 * days ago (feedback calls), each with the phone number, the last call and a quick form to log the call.
 */
export function CallsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "followups";
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canSell(roles.data ?? []);
  const defaults = { renewal: [2, 4], feedback: [14, 16] } as const;
  const [days, setDays] = useState<Record<"renewal" | "feedback", [number, number]>>({ renewal: [2, 4], feedback: [14, 16] });
  const [showCalled, setShowCalled] = useState(false);
  const [mine, setMine] = useState(false);
  const { data: me } = useGetIdentity<{ id?: string }>();
  const followups = useQuery({
    queryKey: ["admin", "sales", "followups", mine, me?.id],
    enabled: tab === "followups",
    queryFn: async () => unwrap(await api.GET("/v1/admin/sales/followups", { params: { query: mine && me?.id ? { owner: me.id } : {} } })).items,
  });
  const calls = useQuery({
    queryKey: ["admin", "sales", "calls", tab, days],
    enabled: tab !== "followups",
    queryFn: async () => {
      const k = tab as "renewal" | "feedback";
      return unwrap(await api.GET("/v1/admin/sales/calls", { params: { query: { kind: k, minDays: days[k][0], maxDays: days[k][1] } } }));
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin", "sales"] }); };
  const n = (v: number) => formatNumber(v, locale);
  const tabs: Tab[] = ["followups", "renewal", "feedback"];
  const name = (x: { name?: string; company?: string }) => (
    <>
      {x.name ?? "—"}
      {x.company && <div className="text-xs text-text-2">{x.company}</div>}
    </>
  );
  const rows = (calls.data?.items ?? []).filter((c) => showCalled || !c.lastCall || (tab === "renewal" && c.lastCall.outcome !== "answered"));

  return (
    <Page title={t("calls.title")} hint={t("calls.hint")}>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((k) => (
          <button key={k} type="button" onClick={() => setParams({ tab: k })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-gold font-bold" : "border-transparent text-text-2 hover:text-text"}`}>
            {t(`calls.tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === "followups" ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            {t("calls.mine")}
          </label>
          {followups.isError && <Notice tone="error">{errorText(followups.error, t)}</Notice>}
          <Card>
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-surface-2"><tr><Th>{t("act.user")}</Th><Th>{t("act.name")}</Th><Th>{t("subs.plan")}</Th><Th>{t("sales.stage")}</Th><Th>{t("sales.next")}</Th><Th>{t("calls.last")}</Th><Th>{t("sales.owner")}</Th></tr></thead>
              <tbody>
                {followups.data?.length === 0 && <tr><Td colSpan={7} className="text-text-2">{t("calls.noFollowups")}</Td></tr>}
                {followups.data?.map((f) => (
                  <tr key={f.userId} className="border-t border-border">
                    <Td><Phone username={f.username} /><Link to={`/activity/${f.userId}`} className="block text-xs text-gold-dark hover:underline">{t("calls.open")}</Link></Td>
                    <Td>{name(f)}</Td>
                    <Td><Badge tone={f.plan === "gold" ? "gold" : "gray"}>{t(`plan.${f.plan}`)}</Badge></Td>
                    <Td><StageBadge stage={f.stage} /></Td>
                    <Td className={`text-xs ${f.nextAt < todayTehran() ? "font-bold text-down" : ""}`}>{formatDate(noonOf(f.nextAt), locale)}{f.nextAt < todayTehran() ? ` · ${t("calls.overdue")}` : ""}</Td>
                    <Td className="max-w-64 text-xs text-text-2">{f.last ? <>{t(`sales.kind.${f.last.kind}`)} · {formatDate(f.last.createdAt, locale)}{f.last.body ? `: ${f.last.body}` : ""}</> : "—"}</Td>
                    <Td className="text-xs">{f.ownerName ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t(`calls.window.${tab}`)}</span>
            <Input type="number" min={0} max={365} value={days[tab][0]} className="w-20" aria-label={t("calls.from")}
              onChange={(e) => setDays({ ...days, [tab]: [Number(e.target.value), days[tab][1]] })} />
            <span>{t("calls.to")}</span>
            <Input type="number" min={0} max={365} value={days[tab][1]} className="w-20" aria-label={t("calls.toDays")}
              onChange={(e) => setDays({ ...days, [tab]: [days[tab][0], Number(e.target.value)] })} />
            <span>{t(`calls.days.${tab}`)}</span>
            {(days[tab][0] !== defaults[tab][0] || days[tab][1] !== defaults[tab][1]) && (
              <Button type="button" tone="ghost" onClick={() => setDays({ ...days, [tab]: [...defaults[tab]] as [number, number] })}>{t("calls.reset")}</Button>
            )}
            <label className="ms-auto flex items-center gap-2">
              <input type="checkbox" checked={showCalled} onChange={(e) => setShowCalled(e.target.checked)} />
              {t("calls.showCalled")}
            </label>
          </div>
          {calls.isError && <Notice tone="error">{errorText(calls.error, t)}</Notice>}
          <Card>
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="bg-surface-2">
                <tr><Th>{t("act.user")}</Th><Th>{t("act.name")}</Th><Th>{t("subs.plan")}</Th><Th>{t(tab === "renewal" ? "calls.ends" : "calls.bought")}</Th><Th>{t("sales.stage")}</Th><Th>{t("calls.last")}</Th>{writable && <Th>{t("calls.log")}</Th>}</tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><Td colSpan={7} className="text-text-2">{t("calls.none")}</Td></tr>}
                {rows.map((c) => (
                  <tr key={c.subscriptionId} className="border-t border-border align-top">
                    <Td><Phone username={c.username} /><Link to={`/activity/${c.userId}`} className="block text-xs text-gold-dark hover:underline">{t("calls.open")}</Link></Td>
                    <Td>{name(c)}</Td>
                    <Td>
                      <Badge tone={c.plan === "gold" ? "gold" : "gray"}>{t(`plan.${c.plan}`)}</Badge>
                      {!c.paid && <div className="mt-1 text-[11px] text-text-3">{t("calls.granted")}</div>}
                    </Td>
                    <Td className="text-xs">{formatDate(tab === "renewal" ? c.endsAt : c.startsAt, locale, true)}</Td>
                    <Td><StageBadge stage={c.stage} /></Td>
                    <Td className="max-w-56 text-xs text-text-2">
                      {c.lastCall ? <>{c.lastCall.outcome ? t(`call.${c.lastCall.outcome}`) : ""} · {c.lastCall.author} · {formatDate(c.lastCall.at, locale)}{c.lastCall.body ? `: ${c.lastCall.body}` : ""}</> : t("calls.notCalled")}
                    </Td>
                    {writable && <Td><CallForm userId={c.userId} kind={tab === "renewal" ? "renewal_call" : "feedback_call"} onDone={refresh} /></Td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-text-3">{t(`calls.note.${tab}`, { n: n(calls.data?.items.length ?? 0) })}</p>
        </>
      )}
    </Page>
  );
}

type Group = "day" | "week" | "month";

/**
 * «گزارش فروش» (client 2026-11-03): paid orders and approved refunds between two days, per day, week or Jalali month,
 * by plan and period and by kind; the orders as an Excel (CSV) file. Real numbers once the payment gateway is live.
 */
export function SalesReportPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [range, setRange] = useState<Range>(lastDays(30));
  const [group, setGroup] = useState<Group>("day");
  const [exportError, setExportError] = useState<unknown>(null);
  const q = useQuery({
    queryKey: ["admin", "report", range, group],
    queryFn: async () => unwrap(await api.GET("/v1/admin/reports/sales", { params: { query: { from: range.from, to: range.to, group } } })),
  });
  const d = q.data;
  const money = (m: { amount: string }) => formatToman(m.amount, locale);
  const n = (v: number) => formatNumber(v, locale);
  const max = Math.max(1, ...(d?.periods.map((p) => Number(p.figures.revenue.amount)) ?? []));
  const label = (p: { start: string; end: string }) => group === "month"
    ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-GB-u-ca-persian", { month: "long", year: "numeric", timeZone: "Asia/Tehran" }).format(new Date(noonOf(p.start)))
    : group === "week" ? `${formatDate(noonOf(p.start), locale)} – ${formatDate(noonOf(p.end), locale)}` : formatDate(noonOf(p.start), locale);
  const exportCsv = async () => {
    setExportError(null);
    try {
      await downloadCsv("/v1/admin/reports/sales/export", { from: range.from, to: range.to }, "sales.csv");
    } catch (e) {
      setExportError(e);
    }
  };

  return (
    <Page title={t("report.title")} hint={t("report.hint")}>
      <RangePicker value={range} onChange={setRange} locale={locale} />
      <div className="flex flex-wrap items-center gap-2">
        {(["day", "week", "month"] as Group[]).map((g) => (
          <Button key={g} type="button" tone={group === g ? "gold" : "ghost"} onClick={() => setGroup(g)}>{t(`report.group.${g}`)}</Button>
        ))}
        <span className="flex-1" />
        <Button type="button" tone="gold" onClick={exportCsv}>⬇ {t("act.export")}</Button>
      </div>
      {q.isError && <Notice tone="error">{errorText(q.error, t)}</Notice>}
      {exportError != null && <Notice tone="error">{errorText(exportError, t)}</Notice>}
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([["report.orders", n(d.totals.orders)], ["report.revenue", money(d.totals.revenue)],
              ["report.refunds", `${money(d.totals.refundAmount)} ${t("report.cases", { n: n(d.totals.refunds) })}`], ["report.net", money(d.totals.net)]] as const).map(([k, v]) => (
              <Card key={k} className="p-4"><div className="text-xs text-text-2">{t(k)}</div><div className="mt-1 text-xl font-extrabold">{v}</div></Card>
            ))}
          </div>
          <Card>
            <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("report.byPeriod")}</h2>
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-surface-2"><tr><Th>{t(`report.period.${group}`)}</Th><Th>{t("report.orders")}</Th><Th>{t("report.revenue")}</Th><Th /><Th>{t("report.refunds")}</Th><Th>{t("report.net")}</Th></tr></thead>
              <tbody>
                {[...d.periods].reverse().map((p) => (
                  <tr key={p.start} className={`border-t border-border ${p.figures.orders || p.figures.refunds ? "" : "text-text-3"}`}>
                    <Td className="text-xs">{label(p)}</Td>
                    <Td className="tabular-nums">{n(p.figures.orders)}</Td>
                    <Td className="tabular-nums">{money(p.figures.revenue)}</Td>
                    <Td className="w-1/4"><span className="block h-2.5 rounded-full bg-gold" style={{ width: `${(Number(p.figures.revenue.amount) / max) * 100}%` }} /></Td>
                    <Td className="tabular-nums text-xs">{p.figures.refunds ? `${money(p.figures.refundAmount)} ${t("report.cases", { n: n(p.figures.refunds) })}` : "—"}</Td>
                    <Td className="tabular-nums font-bold">{money(p.figures.net)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("report.byPlan")}</h2>
              <table className="w-full text-sm">
                <tbody>
                  {d.byPlan.length === 0 && <tr><Td className="text-text-3">{t("report.none")}</Td></tr>}
                  {d.byPlan.map((b) => (
                    <tr key={`${b.plan}-${b.period}`} className="border-t border-border first:border-0">
                      <Td><Badge tone={b.plan === "gold" ? "gold" : "gray"}>{t(`plan.${b.plan}`)}</Badge> {t(`period.${b.period}`)}</Td>
                      <Td className="tabular-nums">{t("report.ordersN", { n: n(b.orders) })}</Td>
                      <Td className="tabular-nums font-bold">{money(b.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card>
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("report.byKind")}</h2>
              <table className="w-full text-sm">
                <tbody>
                  {d.byKind.length === 0 && <tr><Td className="text-text-3">{t("report.none")}</Td></tr>}
                  {d.byKind.map((b) => (
                    <tr key={b.kind} className="border-t border-border first:border-0">
                      <Td>{t(`report.kind.${b.kind}`)}</Td>
                      <Td className="tabular-nums">{t("report.ordersN", { n: n(b.orders) })}</Td>
                      <Td className="tabular-nums font-bold">{money(b.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <p className="text-xs text-text-3">{t("report.note")}</p>
        </>
      )}
    </Page>
  );
}
