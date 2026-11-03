import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link, useParams, useSearchParams } from "react-router";
import { formatDate, formatNumber, formatTime, type Locale } from "@alanfelez/ui/format";
import { api, errorText, unwrap } from "../api";
import { Badge, Button, Card, Input, Notice, Page, Select, Td, Th } from "./ui";
import { ACTIVITIES, Bar, METALS, RangePicker, type Range, addDays, downloadCsv, duration, lastDays, metalColor, noonOf } from "./dates";

type Plan = "free" | "silver" | "gold";

/** The range and filters live in the address, so a profile link and the back button keep them. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const def = lastDays(30);
  const f = {
    from: params.get("from") ?? def.from, to: params.get("to") ?? def.to,
    metal: params.get("metal") ?? "", plan: (params.get("plan") ?? "") as Plan | "", activity: params.get("activity") ?? "",
    q: params.get("q") ?? "", page: Number(params.get("page") ?? "1") || 1,
  };
  const set = (patch: Partial<typeof f>) => {
    const next = { ...f, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== "" && v !== 1).map(([k, v]) => [k, String(v)])), { replace: true });
  };
  return [f, set] as const;
}

const planTone = (p: Plan) => (p === "gold" ? "gold" : "gray");

/**
 * «رفتار کاربران» (client 2026-11-03): each signed-in user's time on the site, the sections they used and the metals
 * they looked at, for any range of days; an Excel (CSV) export for the sales staff. Anonymous visitors are never named.
 */
export function ActivityPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [f, set] = useFilters();
  const [q, setQ] = useState(f.q);
  const [exporting, setExporting] = useState<unknown>(null);
  const list = useQuery({
    queryKey: ["admin", "activity", f],
    queryFn: async () => unwrap(await api.GET("/v1/admin/activity", {
      params: { query: { from: f.from, to: f.to, page: f.page, ...(f.metal ? { metal: f.metal } : {}), ...(f.plan ? { plan: f.plan } : {}),
        ...(f.activity ? { activity: f.activity } : {}), ...(f.q ? { q: f.q } : {}) } },
    })),
  });
  const n = (v: number) => formatNumber(v, locale);
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 50));
  const range: Range = { from: f.from, to: f.to };
  const back = new URLSearchParams({ from: f.from, to: f.to }).toString();

  const exportCsv = async () => {
    setExporting(null);
    try {
      await downloadCsv("/v1/admin/activity/export", { from: f.from, to: f.to, metal: f.metal, plan: f.plan, activity: f.activity, q: f.q }, "activity.csv");
    } catch (e) {
      setExporting(e);
    }
  };

  return (
    <Page title={t("act.title")} hint={t("act.hint")}>
      <RangePicker value={range} onChange={(r) => set(r)} locale={locale} />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={f.metal} onChange={(e) => set({ metal: e.target.value })} aria-label={t("act.metal")}>
          <option value="">{t("act.allMetals")}</option>
          {METALS.map((m) => <option key={m} value={m}>{t(`signup.metal.${m}`)}</option>)}
        </Select>
        <Select value={f.plan} onChange={(e) => set({ plan: e.target.value as Plan | "" })} aria-label={t("subs.plan")}>
          <option value="">{t("act.allPlans")}</option>
          {(["free", "silver", "gold"] as const).map((p) => <option key={p} value={p}>{t(`plan.${p}`)}</option>)}
        </Select>
        <Select value={f.activity} onChange={(e) => set({ activity: e.target.value })} aria-label={t("act.activity")}>
          <option value="">{t("act.allActivities")}</option>
          {ACTIVITIES.map((a) => <option key={a} value={a}>{t(`signup.activity.${a}`)}</option>)}
        </Select>
        <form onSubmit={(e) => { e.preventDefault(); set({ q }); }} className="flex gap-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("act.search")} className="w-56" />
          <Button type="submit" tone="ghost">{t("act.find")}</Button>
        </form>
        <span className="flex-1" />
        <Button type="button" tone="gold" onClick={exportCsv}>⬇ {t("act.export")}</Button>
      </div>
      {list.isError && <Notice tone="error">{errorText(list.error, t)}</Notice>}
      {exporting != null && <Notice tone="error">{errorText(exporting, t)}</Notice>}

      <Card>
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-surface-2">
            <tr>
              <Th>{t("act.user")}</Th><Th>{t("act.name")}</Th><Th>{t("subs.plan")}</Th><Th>{t("act.days")}</Th><Th>{t("act.time")}</Th>
              <Th>{t("act.topSection")}</Th><Th>{t("act.metals")}</Th><Th>{t("act.last")}</Th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 && <tr><Td className="text-text-2">{t("act.none")}</Td></tr>}
            {list.data?.items.map((u) => (
              <tr key={u.userId} className="border-t border-border hover:bg-surface-2">
                <Td>
                  <Link to={`/activity/${u.userId}?${back}`} className="block hover:underline">
                    <div dir="ltr" className="text-end font-bold">{u.username}</div>
                    <code dir="ltr" className="block text-end text-[11px] text-text-3">{u.userId.slice(0, 8)}…</code>
                  </Link>
                </Td>
                <Td>
                  {u.name ?? "—"}
                  {u.company && <div className="text-xs text-text-2">{u.company}</div>}
                </Td>
                <Td><Badge tone={planTone(u.plan)}>{t(`plan.${u.plan}`)}</Badge></Td>
                <Td className="tabular-nums">{n(u.days)} <span className="text-xs text-text-3">({t("act.pages", { n: n(u.views) })})</span></Td>
                <Td className="text-xs">{duration(u.seconds, locale, t)}</Td>
                <Td className="text-xs">{u.sections[0] ? t(`section.${u.sections[0].section}`) : "—"}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.metals.length === 0 && <span className="text-xs text-text-3">—</span>}
                    {u.metals.slice(0, 4).map((m) => (
                      <span key={m.metal} className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: metalColor(m.metal) }}>
                        {t(`signup.metal.${m.metal}`, m.metal)} {n(m.views)}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td className="text-xs text-text-2">{u.lastAt ? formatDate(u.lastAt, locale, true) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {list.data && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-2">{t("act.total", { n: n(list.data.total) })}</span>
          <span className="flex-1" />
          <Button type="button" tone="ghost" disabled={f.page <= 1} onClick={() => set({ page: f.page - 1 })}>{t("page.prev")}</Button>
          <span className="tabular-nums">{t("page.of", { page: n(f.page), pages: n(pages) })}</span>
          <Button type="button" tone="ghost" disabled={f.page >= pages} onClick={() => set({ page: f.page + 1 })}>{t("page.next")}</Button>
        </div>
      )}
      <p className="text-xs text-text-3">{t("act.note")}</p>
    </Page>
  );
}

/** One user's activity: totals, metals, products, sections, a bar per day (pick one to see its pages). */
export function ActivityUserPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const def = lastDays(30);
  const range: Range = { from: params.get("from") ?? def.from, to: params.get("to") ?? def.to };
  const day = params.get("day") ?? undefined;
  const [exporting, setExporting] = useState<unknown>(null);
  const setRange = (r: Range) => setParams({ from: r.from, to: r.to }, { replace: true });
  const setDay = (d: string) => setParams({ ...range, day: d }, { replace: true });

  const q = useQuery({
    queryKey: ["admin", "activity", id, range, day],
    queryFn: async () => unwrap(await api.GET("/v1/admin/activity/{id}", {
      params: { path: { id }, query: { from: range.from, to: range.to, ...(day ? { day } : {}) } },
    })),
  });
  const d = q.data;
  const n = (v: number) => formatNumber(v, locale);
  const exportCsv = async () => {
    setExporting(null);
    try {
      await downloadCsv("/v1/admin/activity/export", { from: range.from, to: range.to, userId: id }, "activity.csv");
    } catch (e) {
      setExporting(e);
    }
  };

  // Every day of the range gets a bar, empty days included, so the timeline reads like a calendar.
  const days: { day: string; seconds: number; views: number }[] = [];
  if (d) {
    const byDay = new Map(d.daily.map((x) => [x.day, x]));
    for (let cur = range.from, i = 0; cur <= range.to && i < 800; cur = addDays(cur, 1), i++) days.push(byDay.get(cur) ?? { day: cur, seconds: 0, views: 0 });
  }
  const maxDay = Math.max(1, ...days.map((x) => x.seconds || x.views));
  const maxMetal = Math.max(1, ...(d?.metals.map((m) => m.views) ?? []));
  const maxSection = Math.max(1, ...(d?.sections.map((s) => s.seconds) ?? []));
  const u = d?.user;
  const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") : "";
  const top = d?.metals[0];

  return (
    <Page title={t("act.profile")}>
      <Link to={`/activity?from=${range.from}&to=${range.to}`} className="text-sm text-gold-dark hover:underline">{t("act.back")}</Link>
      {q.isError && <Notice tone="error">{errorText(q.error, t, { NOT_FOUND: "act.notFound" })}</Notice>}
      {exporting != null && <Notice tone="error">{errorText(exporting, t)}</Notice>}
      {u && d && (
        <>
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-graphite text-xl font-extrabold text-gold">{(name || u.username).slice(0, 1)}</div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
                {name || "—"}
                <Badge tone={planTone(u.currentPlan)}>{t(`plan.${u.currentPlan}`)}{u.currentEndsAt ? ` · ${t("act.until", { date: formatDate(u.currentEndsAt, locale) })}` : ""}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-3 text-sm text-text-2">
                <span dir="ltr" className="font-bold">{u.username}</span>
                <code dir="ltr" className="text-xs text-text-3">{u.id}</code>
                {u.company && <span>{u.company}</span>}
                {u.activity && <span>{t(`signup.activity.${u.activity}`, u.activity)}</span>}
                {u.province && <span>{u.province}</span>}
              </div>
              {u.metals?.length ? <div className="text-xs text-text-2">{t("act.signupMetals")}: {u.metals.map((m) => t(`signup.metal.${m}`, m)).join(locale === "fa" ? "، " : ", ")}</div> : null}
            </div>
            <Link to={`/orders?user=${u.id}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-gold">{t("users.orders")}</Link>
            <Button type="button" tone="gold" onClick={exportCsv}>⬇ {t("act.exportUser")}</Button>
          </Card>
          <RangePicker value={range} onChange={setRange} locale={locale} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([["act.days", n(d.days)], ["act.time", duration(d.seconds, locale, t)], ["act.avg", d.days ? duration(d.seconds / d.days, locale, t) : "—"],
              ["act.firstLast", d.firstAt && d.lastAt ? `${formatDate(d.firstAt, locale)} – ${formatDate(d.lastAt, locale, true)}` : "—"]] as const).map(([k, v]) => (
              <Card key={k} className="p-4">
                <div className="text-xs text-text-2">{t(k)}</div>
                <div className="mt-1 text-lg font-extrabold">{v}</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("act.metalInterest")}</h2>
              <div className="space-y-2 p-4">
                {d.metals.length === 0 && <p className="text-sm text-text-3">{t("act.noMetals")}</p>}
                {d.metals.map((m) => (
                  <Bar key={m.metal} label={t(`signup.metal.${m.metal}`, m.metal)} value={m.views} max={maxMetal} color={metalColor(m.metal)} text={t("act.views", { n: n(m.views) })} />
                ))}
                {d.products.length > 0 && (
                  <p className="pt-1 text-xs text-text-2">{t("act.products")}: {d.products.map((p) => `${p.name} (${n(p.views)})`).join(locale === "fa" ? "، " : ", ")}</p>
                )}
              </div>
            </Card>
            <Card>
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("act.sections")}</h2>
              <div className="space-y-2 p-4">
                {d.sections.map((s) => (
                  <Bar key={s.section} label={t(`section.${s.section}`)} value={s.seconds} max={maxSection} color="#c9a227" text={duration(s.seconds, locale, t)} />
                ))}
              </div>
            </Card>
            <Card>
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("act.dayPages", { day: formatDate(noonOf(d.day), locale) })}</h2>
              <ul className="max-h-80 overflow-y-auto px-4 py-2 text-xs">
                {d.pages.length === 0 && <li className="py-2 text-text-3">{t("act.noPages")}</li>}
                {d.pages.map((p, i) => (
                  <li key={i} className="grid grid-cols-[3.5rem_1fr_auto] gap-2 border-b border-dashed border-border py-1.5 last:border-0">
                    <span className="tabular-nums text-text-2">{formatTime(p.at, locale)}</span>
                    <span>
                      {t(`section.${p.section}`)}
                      {(p.product || p.metal) && <> ← {p.product ?? t(`signup.metal.${p.metal}`, p.metal ?? "")}</>}
                    </span>
                    <span className="tabular-nums text-text-2">{p.seconds ? duration(p.seconds, locale, t) : "—"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card>
            <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm font-bold">
              {t("act.daily")}
              <span className="text-xs font-normal text-text-2">{t("act.dailyHint")}</span>
            </h2>
            <div className="flex h-28 items-end gap-0.5 px-4 pt-3" role="list">
              {days.map((x) => (
                <button key={x.day} type="button" role="listitem" onClick={() => setDay(x.day)}
                  title={`${formatDate(noonOf(x.day), locale)} · ${duration(x.seconds, locale, t)} · ${t("act.pages", { n: n(x.views) })}`}
                  className={`min-w-[3px] flex-1 rounded-t ${x.day === d.day ? "bg-gold outline outline-2 outline-graphite" : x.views ? "bg-gold/45 hover:bg-gold/70" : "bg-surface-2"}`}
                  style={{ height: `${Math.max(3, ((x.seconds || x.views) / maxDay) * 100)}%` }} />
              ))}
            </div>
            <div className="flex justify-between px-4 pb-3 pt-1 text-[11px] text-text-3">
              <span>{formatDate(noonOf(range.from), locale)}</span>
              <span>{formatDate(noonOf(range.to), locale)}</span>
            </div>
          </Card>

          {top && (
            <div className="rounded-card border border-gold-light bg-gold/10 p-4 text-sm">
              💡 <b className="text-gold-dark">{t("act.tipTitle")}</b>{" "}
              {t("act.tip", { metal: t(`signup.metal.${top.metal}`, top.metal), from: formatDate(noonOf(range.from), locale), to: formatDate(noonOf(range.to), locale) })}
              {d.products[0] && d.products[0].metal === top.metal && <> {t("act.tipProduct", { product: d.products[0].name })}</>}
              {u.metals?.length ? <> {t("act.tipSignup", { metals: u.metals.map((m) => t(`signup.metal.${m}`, m)).join(locale === "fa" ? "، " : ", ") })}</> : null}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

