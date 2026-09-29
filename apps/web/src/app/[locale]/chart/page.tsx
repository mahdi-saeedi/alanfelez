import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Schemas } from "@alanfelez/api-client";
import { displayAmount, formatBp, formatPriceValue, priceUnitLabel, type Locale, type PriceDisplay } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getEntitlements, getHistory, getPrices, type PriceRow } from "@/lib/prices";
import { AreaChart } from "@/components/prices/AreaChart";
import { Sparkline } from "@/components/prices/Sparkline";
import { LivePrice, LiveUpdated } from "@/components/prices/LivePrice";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Locked, LockIcon } from "@/components/Locked";

export const dynamic = "force-dynamic";

type Range = Schemas["ChartRange"];
const RANGES: Range[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "MAX"];
const RANGE_DAYS: Record<Range, number> = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "3Y": 1095, MAX: 0 };
const UNITS = ["toman-kg", "toman-ton", "rial-kg", "rial-ton"] as const;
type UnitOpt = (typeof UNITS)[number] | "usd-ton";

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ series?: string; range?: string; unit?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chart" });
  return seo(locale, "/chart", { title: t("title"), description: t("subtitle") });
}

/** Price chart (SCOPE §5 #3, §14; design 08-price-chart). History depth is limited by the tier in the API. */
export default async function ChartPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const q = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("chart");
  const tl = await getTranslations("lock");

  const [prices, ent] = await Promise.all([getPrices(locale), getEntitlements()]);
  const rows = prices?.items ?? [];
  if (rows.length === 0) {
    return <p className="mx-auto max-w-7xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  }
  const row = rows.find((r) => r.series.slug === q.series) ?? rows.find((r) => r.series.slug === "copper-red-free") ?? rows[0]!;
  const range: Range = RANGES.includes(q.range as Range) ? (q.range as Range) : "1M";
  const usd = row.series.currency === "USD";
  const unit: UnitOpt = usd ? "usd-ton" : UNITS.includes(q.unit as (typeof UNITS)[number]) ? (q.unit as UnitOpt) : "toman-kg";
  const display: PriceDisplay = { rial: unit.startsWith("rial"), perTon: unit.endsWith("ton") };
  const limit = ent?.limits["chart.history_days"] ?? 30;
  const rangeAllowed = (r: Range) => limit === 0 || (RANGE_DAYS[r] > 0 && RANGE_DAYS[r] <= limit);

  const history = await getHistory(locale, row.series.slug, range);
  const points =
    "data" in history && history.data
      ? history.data.points.map((p) => ({ t: p.t, v: Number(displayAmount({ amount: p.amount, currency: row.series.currency, unit: row.series.unit }, display)) }))
      : [];
  const stats = points.length ? statsOf(points.map((p) => p.v)) : null;
  const fmt = (v: number) => (usd ? "$" : "") + new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 0 }).format(v);

  // Quick compare: the base series of every metal, 1M sparkline each (always allowed for base series).
  const compare = rows.filter((r) => r.series.isBase);
  const sparks = await Promise.all(compare.map((r) => getHistory(locale, r.series.slug, "1M")));
  const byMetal = groupByMetal(rows);
  const chartHref = (qq: Record<string, string>) => ({ pathname: "/chart", query: { series: row.series.slug, range, unit, ...qq } });
  const lockedPlan = "locked" in history && history.locked ? history.locked.plan : null;
  const analysisAllowed = ent?.features["analysis.read"] === true;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-text-2">{t("subtitle")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <div className="min-w-0 space-y-4">
          <form action={locale === "en" ? "/en/chart" : "/chart"} className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4 shadow-soft">
            <input type="hidden" name="range" value={range} />
            <AutoSubmitSelect name="series" value={row.series.slug} label={t("product")}>
              {byMetal.map(([metal, list]) => (
                <optgroup key={metal} label={metal}>
                  {list.map((r) => (
                    <option key={r.series.slug} value={r.series.slug}>
                      {r.series.product.name} — {r.series.market.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </AutoSubmitSelect>
            {!usd && (
              <AutoSubmitSelect name="unit" value={unit} label={t("unit")}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>{t(`unitOptions.${u}`)}</option>
                ))}
              </AutoSubmitSelect>
            )}
            <noscript>
              <button className="rounded-control bg-graphite px-4 py-2 text-sm text-white">OK</button>
            </noscript>
          </form>

          <section className="rounded-card border border-border bg-surface shadow-soft">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-border p-5">
              <div>
                <div className="text-xs text-text-2">{t("current")}</div>
                <div className="text-2xl font-extrabold tabular-nums">
                  {usd && "$"}
                  <LivePrice slug={row.series.slug} display={display} fallback={row.price ? formatPriceValue(row.price, locale, display) : "—"} />
                  <span className="ms-2 text-xs font-normal text-text-3" dir="ltr">{priceUnitLabel(row.series, locale, display)}</span>
                </div>
              </div>
              {stats && (
                <>
                  <Stat label={t("change", { range: t(`ranges.${range}`) })} value={formatBp(stats.changeBp, locale)} tone={stats.changeBp >= 0 ? "text-up" : "text-down"} ltr />
                  <Stat label={t("high")} value={fmt(stats.high)} />
                  <Stat label={t("low")} value={fmt(stats.low)} />
                  <Stat label={t("avg")} value={fmt(stats.avg)} />
                </>
              )}
            </div>

            <nav className="flex flex-wrap gap-1 px-5 pt-4" aria-label="range">
              {RANGES.map((r) =>
                rangeAllowed(r) ? (
                  <Link
                    key={r}
                    href={chartHref({ range: r })}
                    aria-current={r === range ? "page" : undefined}
                    className={`rounded-md px-3 py-1 text-xs font-bold ${r === range ? "bg-graphite text-white" : "text-text-2 hover:bg-surface-2"}`}
                  >
                    {t(`ranges.${r}`)}
                  </Link>
                ) : (
                  <Link key={r} href="/plans" title={t("lockedRange", { plan: tl("plan.silver") })} className="flex items-center gap-1 rounded-md px-3 py-1 text-xs text-text-3 hover:bg-surface-2">
                    <LockIcon className="h-3.5 w-3.5" />
                    {t(`ranges.${r}`)}
                  </Link>
                ),
              )}
            </nav>

            <div className="p-5">
              {lockedPlan ? (
                <Locked plan={lockedPlan}>{t("lockedSeries", { plan: tl(`plan.${lockedPlan}`) })}</Locked>
              ) : points.length > 1 ? (
                <AreaChart points={points} locale={locale} intraday={range === "1D" || range === "1W"} format={usd ? "usd" : "int"} />
              ) : (
                <p className="py-16 text-center text-text-2">{t("noHistory")}</p>
              )}
              <p className="mt-3 text-xs text-text-3">
                {t("source", { source: row.source ?? row.series.market.name, time: "" })}
                <LiveUpdated slug={row.series.slug} fallback={row.observedAt} />
              </p>
            </div>
          </section>

          {!analysisAllowed && (
            <Locked plan="gold" title={t("advancedTitle")}>{t("advancedBody")}</Locked>
          )}
        </div>

        <aside>
          <h2 className="mb-3 text-sm font-bold">{t("quickCompare")}</h2>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {compare.map((r, i) => {
              const h = sparks[i];
              const vs = h && "data" in h && h.data ? h.data.points.map((p) => Number(p.amount)) : [];
              const on = r.series.slug === row.series.slug;
              return (
                <li key={r.series.slug}>
                  <Link
                    href={chartHref({ series: r.series.slug })}
                    className={`block rounded-card border bg-surface p-3 shadow-soft ${on ? "border-gold" : "border-border hover:border-border-strong"}`}
                  >
                    <div className="text-xs font-bold">{r.series.metal.name}</div>
                    <Sparkline values={vs} className="mt-1 h-10 w-full" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "", ltr = false }: { label: string; value: string; tone?: string; ltr?: boolean }) {
  return (
    <div>
      <div className="text-xs text-text-2">{label}</div>
      <div className={`font-bold tabular-nums ${tone}`} dir={ltr ? "ltr" : undefined}>{value}</div>
    </div>
  );
}

function statsOf(vs: number[]) {
  const first = vs[0] ?? 0;
  const last = vs[vs.length - 1] ?? 0;
  return {
    changeBp: first ? Math.trunc(((last - first) * 10_000) / first) : 0,
    high: Math.max(...vs),
    low: Math.min(...vs),
    avg: vs.reduce((a, b) => a + b, 0) / vs.length,
  };
}

function groupByMetal(rows: PriceRow[]): [string, PriceRow[]][] {
  const m = new Map<string, PriceRow[]>();
  for (const r of rows) m.set(r.series.metal.name, [...(m.get(r.series.metal.name) ?? []), r]);
  return [...m];
}
