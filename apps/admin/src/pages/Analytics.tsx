import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { api, errorText, unwrap } from "../api";
import { Button, Card, Notice, Page, Select, Td, Th } from "./ui";
import { Bar, RangePicker, type Range, downloadCsv, duration, lastDays, metalColor } from "./dates";

type A = Schemas["AdminAnalytics"];
type Tab = "products" | "sections" | "funnel" | "traffic" | "searches";
const TABS: Tab[] = ["products", "sections", "funnel", "traffic", "searches"];

/**
 * «تحلیل بازدید» (client, 2026-11-05): what everyone looks at (products, metals, sections by audience), the sales
 * funnel and the section that sent visitors to the plans page, where visits come from, devices, provinces and site
 * searches. Nameless totals; every table exports to Excel.
 */
export function AnalyticsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [range, setRange] = useState<Range>(lastDays(30));
  const [tab, setTab] = useState<Tab>("products");
  const q = useQuery({
    queryKey: ["admin", "analytics", range],
    queryFn: async () => unwrap(await api.GET("/v1/admin/analytics", { params: { query: { from: range.from, to: range.to } } })),
  });
  const [exportError, setExportError] = useState<unknown>();
  const exportTable = (table: "products" | "metals" | "sections" | "traffic" | "searches") =>
    downloadCsv("/v1/admin/analytics/export", { from: range.from, to: range.to, table }, `analytics-${table}.csv`).catch(setExportError);
  const n = (v: number) => formatNumber(v, locale);
  const a = q.data;
  return (
    <Page title={t("an.title")} hint={t("an.hint")}>
      <div className="flex flex-wrap items-center gap-2">
        <RangePicker value={range} onChange={setRange} locale={locale} />
        <div className="flex flex-wrap gap-1">
          {TABS.map((x) => (
            <Button key={x} type="button" tone={x === tab ? "dark" : "ghost"} onClick={() => setTab(x)}>{t(`an.tab.${x}`)}</Button>
          ))}
        </div>
      </div>
      {q.isError && <Notice tone="error">{errorText(q.error, t)}</Notice>}
      {exportError !== undefined && <Notice tone="error">{errorText(exportError, t)}</Notice>}
      {q.isLoading && <p className="text-text-2">{t("table.loading")}</p>}
      {a && tab === "products" && <Products a={a} n={n} locale={locale} onExport={exportTable} />}
      {a && tab === "sections" && <Sections a={a} n={n} locale={locale} onExport={exportTable} />}
      {a && tab === "funnel" && <Funnel a={a} n={n} />}
      {a && tab === "traffic" && <Traffic a={a} n={n} onExport={exportTable} />}
      {a && tab === "searches" && <Searches a={a} n={n} onExport={exportTable} />}
    </Page>
  );
}

type Ex = (table: "products" | "metals" | "sections" | "traffic" | "searches") => void;

function ExportButton({ onClick }: { onClick: () => void }) {
  const t = useTranslate();
  return <Button type="button" tone="ghost" onClick={onClick}>{t("an.export")}</Button>;
}

/** +12٪ green / −8٪ red against the period before; «جدید» when there was nothing before. */
function Trend({ now, before, locale }: { now: number; before: number; locale: Locale }) {
  const t = useTranslate();
  if (!before) return now ? <span className="text-xs text-text-3">{t("an.new")}</span> : null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="text-xs text-text-3">۰٪</span>;
  return <span className={`text-xs font-bold ${pct > 0 ? "text-up" : "text-down"}`} dir="ltr">{pct > 0 ? "▲" : "▼"} {formatNumber(Math.abs(pct), locale)}٪</span>;
}

function Products({ a, n, locale, onExport }: { a: A; n: (v: number) => string; locale: Locale; onExport: Ex }) {
  const t = useTranslate();
  const [metal, setMetal] = useState("");
  const max = Math.max(1, ...a.metals.map((m) => m.views));
  const rows = a.products.filter((p) => !metal || p.metal === metal);
  return (
    <>
      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">{t("an.metals")}</h2>
          <ExportButton onClick={() => onExport("metals")} />
        </div>
        {a.metals.map((m) => (
          <div key={m.metal} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <Bar label={m.name} value={m.views} max={max} color={metalColor(m.metal)} text={`${n(m.views)} ${t("an.viewsShort")} · ${t("an.visitorsN", { n: n(m.visitors) })}`} />
            <Trend now={m.views} before={m.prevViews} locale={locale} />
          </div>
        ))}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <h2 className="font-bold">{t("an.products")}</h2>
          <div className="flex gap-2">
            <Select value={metal} onChange={(e) => setMetal(e.target.value)}>
              <option value="">{t("an.allMetals")}</option>
              {a.metals.map((m) => <option key={m.metal} value={m.metal}>{m.name}</option>)}
            </Select>
            <ExportButton onClick={() => onExport("products")} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2">
              <tr><Th>{t("an.product")}</Th><Th>{t("an.views")}</Th><Th>{t("an.trend")}</Th><Th>{t("an.visitors")}</Th><Th>{t("an.paidViews")}</Th><Th>{t("an.avgTime")}</Th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><Td className="text-text-2">{t("an.empty")}</Td></tr>}
              {rows.map((p) => (
                <tr key={p.series} className="border-t border-border">
                  <Td>
                    <div className="font-bold">{p.product}</div>
                    <div className="text-xs text-text-3">{p.metalName} · {p.market} · {p.unit}</div>
                  </Td>
                  <Td className="tabular-nums font-bold">{n(p.views)}</Td>
                  <Td><Trend now={p.views} before={p.prevViews} locale={locale} /></Td>
                  <Td className="tabular-nums">{n(p.visitors)}</Td>
                  <Td className="tabular-nums">{n(p.paidViews)}</Td>
                  <Td className="text-xs">{duration(p.views ? Math.round(p.seconds / p.views) : 0, locale, t)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Sections({ a, n, locale, onExport }: { a: A; n: (v: number) => string; locale: Locale; onExport: Ex }) {
  const t = useTranslate();
  const total = (s: A["sections"][number]) => s.guest.views + s.free.views + s.paid.views;
  const rows = [...a.sections].sort((x, y) => total(y) - total(x));
  const max = Math.max(1, ...rows.map(total));
  const all = Math.max(1, rows.reduce((s, r) => s + total(r), 0));
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">{t("an.sections")}</h2>
        <ExportButton onClick={() => onExport("sections")} />
      </div>
      <p className="text-xs text-text-3">{t("an.sectionsHint")}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        <span><i className="me-1 inline-block h-2 w-3 rounded bg-[#9ca3af]" />{t("an.aud.guest")}</span>
        <span><i className="me-1 inline-block h-2 w-3 rounded bg-[#5f8fb3]" />{t("an.aud.free")}</span>
        <span><i className="me-1 inline-block h-2 w-3 rounded bg-[#c9a227]" />{t("an.aud.paid")}</span>
      </div>
      {rows.map((s) => (
        <div key={s.section} className="space-y-1">
          <div className="flex justify-between text-sm">
            <b>{t(`section.${s.section}`)}</b>
            <span className="text-xs text-text-2">
              {n(total(s))} {t("an.viewsShort")} · {formatNumber(Math.round((total(s) / all) * 100), locale)}٪ · {t("an.visitorsN", { n: n(s.visitors) })} ·{" "}
              {duration(s.guest.seconds + s.free.seconds + s.paid.seconds, locale, t)}
            </span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" style={{ width: `${Math.max(4, (total(s) / max) * 100)}%` }}>
            {(["guest", "free", "paid"] as const).map((k) => (
              <span key={k} title={`${t(`an.aud.${k}`)}: ${n(s[k].views)}`} style={{ width: `${(s[k].views / Math.max(1, total(s))) * 100}%`, background: k === "guest" ? "#9ca3af" : k === "free" ? "#5f8fb3" : "#c9a227" }} />
            ))}
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-text-2">{t("an.empty")}</p>}
    </Card>
  );
}

function Funnel({ a, n }: { a: A; n: (v: number) => string }) {
  const t = useTranslate();
  const steps = [
    ["visitors", a.funnel.visitors], ["signups", a.funnel.signups], ["plans", a.funnel.plansVisitors],
    ["checkout", a.funnel.checkoutVisitors], ["buyers", a.funnel.buyers],
  ] as const;
  const top = Math.max(1, steps[0]![1]);
  return (
    <>
      <Card className="space-y-3 p-4">
        <h2 className="font-bold">{t("an.funnel")}</h2>
        <p className="text-xs text-text-3">{t("an.funnelHint")}</p>
        {steps.map(([k, v], i) => {
          const before = i > 0 ? steps[i - 1]![1] : 0;
          return (
          <div key={k} className="space-y-1">
            <div className="flex justify-between text-sm">
              <b>{t(`an.step.${k}`)}</b>
              <span className="tabular-nums">
                {n(v)}
                {before > 0 && <span className="ms-2 text-xs text-text-3">({n(Math.round((v / before) * 100))}٪ {t("an.ofPrev")})</span>}
              </span>
            </div>
            <div className="h-4 rounded bg-surface-2">
              <div className="h-4 rounded bg-gold" style={{ width: `${Math.max(1, (v / top) * 100)}%` }} />
            </div>
          </div>
          );
        })}
      </Card>
      <Card>
        <h2 className="p-3 font-bold">{t("an.plansFrom")}</h2>
        <p className="px-3 pb-2 text-xs text-text-3">{t("an.plansFromHint")}</p>
        <table className="w-full text-sm">
          <thead className="bg-surface-2"><tr><Th>{t("an.fromSection")}</Th><Th>{t("an.toPage")}</Th><Th>{t("an.views")}</Th></tr></thead>
          <tbody>
            {a.plansFrom.length === 0 && <tr><Td className="text-text-2">{t("an.empty")}</Td></tr>}
            {a.plansFrom.map((r) => (
              <tr key={`${r.page}-${r.section}-${r.metal}`} className="border-t border-border">
                <Td>{t(`section.${r.section}`)}{r.metal && <span className="ms-2 text-xs text-text-3">({a.metals.find((m) => m.metal === r.metal)?.name ?? r.metal})</span>}</Td>
                <Td>{t(`section.${r.page}`)}</Td>
                <Td className="tabular-nums font-bold">{n(r.views)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Traffic({ a, n, onExport }: { a: A; n: (v: number) => string; onExport: Ex }) {
  const t = useTranslate();
  const or = (k: string, fallback: string) => (t(k) === k ? fallback : t(k)); // a key not in i18n.ts comes back as itself
  const source = (s: string) => (s.startsWith("utm:") ? `${t("an.campaignTag")}: ${s.slice(4)}` : s.startsWith("ref:") ? s.slice(4) : or(`an.src.${s}`, s));
  const dev = Math.max(1, ...a.devices.map((d) => d.visitorDays));
  const prov = Math.max(1, ...a.provinces.map((p) => p.members));
  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-2 p-3">
          <h2 className="font-bold">{t("an.traffic")}</h2>
          <ExportButton onClick={() => onExport("traffic")} />
        </div>
        <p className="px-3 pb-2 text-xs text-text-3">{t("an.trafficHint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2"><tr><Th>{t("an.source")}</Th><Th>{t("an.campaign")}</Th><Th>{t("an.landings")}</Th><Th>{t("an.signups")}</Th><Th>{t("an.buyers")}</Th></tr></thead>
            <tbody>
              {a.traffic.length === 0 && <tr><Td className="text-text-2">{t("an.empty")}</Td></tr>}
              {a.traffic.map((r) => (
                <tr key={`${r.source}-${r.campaign}`} className="border-t border-border">
                  <Td className="font-bold">{source(r.source)}</Td>
                  <Td dir="ltr" className="text-start text-xs">{r.campaign || "—"}</Td>
                  <Td className="tabular-nums">{n(r.landings)}</Td>
                  <Td className="tabular-nums">{n(r.signups)}</Td>
                  <Td className="tabular-nums font-bold">{n(r.buyers)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">{t("an.devices")}</h2>
          {a.devices.map((d) => <Bar key={d.device} label={or(`an.dev.${d.device}`, d.device)} value={d.visitorDays} max={dev} color="#5f8fb3" text={n(d.visitorDays)} />)}
        </Card>
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">{t("an.provinces")}</h2>
          <p className="text-xs text-text-3">{t("an.provincesHint")}</p>
          {a.provinces.map((p) => <Bar key={p.province || "-"} label={p.province || t("an.noProvince")} value={p.members} max={prov} color="#c9a227" text={`${n(p.members)} (${n(p.paying)} ${t("an.paying")})`} />)}
        </Card>
      </div>
    </>
  );
}

function Searches({ a, n, onExport }: { a: A; n: (v: number) => string; onExport: Ex }) {
  const t = useTranslate();
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 p-3">
        <h2 className="font-bold">{t("an.searches")}</h2>
        <ExportButton onClick={() => onExport("searches")} />
      </div>
      <p className="px-3 pb-2 text-xs text-text-3">{t("an.searchesHint")}</p>
      <table className="w-full text-sm">
        <thead className="bg-surface-2"><tr><Th>{t("an.term")}</Th><Th>{t("an.searchCount")}</Th><Th>{t("an.zero")}</Th></tr></thead>
        <tbody>
          {a.searches.length === 0 && <tr><Td className="text-text-2">{t("an.empty")}</Td></tr>}
          {a.searches.map((r) => (
            <tr key={r.term} className={`border-t border-border ${r.zeroResults === r.searches ? "bg-down/5" : ""}`}>
              <Td className="font-bold">{r.term}</Td>
              <Td className="tabular-nums">{n(r.searches)}</Td>
              <Td className={`tabular-nums ${r.zeroResults ? "font-bold text-down" : ""}`}>{n(r.zeroResults)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
