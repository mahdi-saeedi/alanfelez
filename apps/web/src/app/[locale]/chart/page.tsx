import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Schemas } from "@alanfelez/api-client";
import { displayAmount, formatBp, formatPriceValue, priceUnitLabel, type Locale, type PriceDisplay } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getEntitlements, getHistory, getPrices, type PriceRow } from "@/lib/prices";
import { AreaChart } from "@/components/prices/AreaChart";
import { Sparkline } from "@/components/prices/Sparkline";
import { CompareChart, type CompareLine } from "@/components/prices/CompareChart";
import { COMPARE_COLORS } from "@/components/prices/compare-colors";
import { LivePrice, LiveUpdated } from "@/components/prices/LivePrice";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Locked, LockIcon } from "@/components/Locked";
import { InsightCard } from "@/components/content/InsightCard";
import { getArticles } from "@/lib/content";

export const dynamic = "force-dynamic";

type Range = Schemas["ChartRange"];
const RANGES: Range[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "MAX"];
const RANGE_DAYS: Record<Range, number> = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "3Y": 1095, MAX: 0 };
const UNITS = ["toman-kg", "toman-ton", "rial-kg", "rial-ton"] as const;
type UnitOpt = (typeof UNITS)[number] | "usd-ton";

const SLOTS = ["c1", "c2", "c3", "c4"] as const; // the side panel compares up to 4 charts (client, 2026-10-25)
type Slot = (typeof SLOTS)[number];
type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ series?: string; metal?: string; cat?: string; range?: string; unit?: string; view?: string } & Partial<Record<Slot, string>>> };

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
  // The picker also lists the products the caller's plan doesn't include (names only, from lockedSeries), marked
  // «ویژه‌ی نقره‌ای»: picking one shows that product locked instead of quietly swapping in another (client, 2026-10-28).
  const lockedSlugs = new Set((prices?.lockedSeries ?? []).map((s) => s.slug));
  const all: PriceRow[] = [...rows, ...(prices?.lockedSeries ?? []).map((series) => ({ series }) as PriceRow)];
  const lockedPlanName = prices?.lockedFeature ? tl(`plan.${prices.lockedFeature.requiredPlan}`) : "";
  // The picker narrows step by step (client, 2026-10-25): metal → category (global price, intermediate, scrap, raw)
  // → product. Each select submits the form; a choice that no longer fits the earlier ones falls back to the first.
  const metals = uniqueBy(all.map((r) => r.series.metal), (m) => m.slug);
  // Free plans chart world prices only (client, 2026-10-28), so their default is a world price.
  const chartsAll = ent?.features["chart.full"] === true;
  const fallback = chartsAll ? rows.find((r) => r.series.slug === "copper-red-free") : rows.find((r) => r.series.market.scope === "global");
  const asked = all.find((r) => r.series.slug === q.series) ?? fallback ?? rows[0]!;
  const metal = metals.find((m) => m.slug === q.metal)?.slug ?? asked.series.metal.slug;
  const inMetal = all.filter((r) => r.series.metal.slug === metal);
  const cats = CATS.filter((c) => inMetal.some((r) => catOf(r) === c));
  const cat = cats.find((c) => c === q.cat) ?? (asked.series.metal.slug === metal ? catOf(asked) : cats[0]!);
  const products = inMetal.filter((r) => catOf(r) === cat);
  const row = products.find((r) => r.series.slug === q.series) ?? products.find((r) => !lockedSlugs.has(r.series.slug)) ?? products[0]!;
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

  // Compare panel: up to 4 charts of any series the caller may see, one under another. Defaults: the global prices,
  // else the first base series. "" in a slot = empty.
  // Compare slots accept every product, the locked ones too: they show as 🔒 (client, 2026-10-28: comparing global and
  // IME prices is free, the rest needs a plan).
  const bySlug = new Map(all.map((r) => [r.series.slug, r]));
  const global = rows.filter((r) => r.series.isBase && r.series.market.scope === "global");
  const defaults = (global.length ? global : rows.filter((r) => r.series.isBase)).slice(0, 4).map((r) => r.series.slug);
  const anySlot = SLOTS.some((k) => q[k] !== undefined);
  const picked = SLOTS.map((k, i) => (anySlot ? (q[k] && bySlug.has(q[k]!) ? q[k]! : "") : (defaults[i] ?? "")));
  const compareRange: Range = rangeAllowed(range) ? range : "1M";
  const compare = await Promise.all(
    picked.map(async (slug) => {
      const r = slug ? bySlug.get(slug) : undefined;
      if (!r) return null;
      const h = await getHistory(locale, slug, compareRange);
      const pts = "data" in h && h.data ? h.data.points.map((p) => ({ t: p.t, v: Number(p.amount) })) : [];
      return {
        row: r, values: pts.map((p) => p.v), points: pts,
        locked: "locked" in h && h.locked ? h.locked.plan : null,
        lockedHistory: "locked" in h && h.locked ? h.locked.feature === "chart.full" : false,
      };
    }),
  );
  const catLabel = (c: Cat) => t(`categories.${c}`);
  const groups = groupByMetalAndCategory(all, catLabel);
  // «ویژه‌ی نقره‌ای» on products whose price is locked, and (free plans) on non-world products, whose chart is locked.
  const chartLocked = (r: PriceRow) => lockedSlugs.has(r.series.slug) || (!chartsAll && r.series.market.scope !== "global");
  const optionName = (r: PriceRow) =>
    `${r.series.product.name} — ${r.series.market.name}${chartLocked(r) ? ` (${t("lockedOption", { plan: lockedPlanName || tl("plan.silver") })})` : ""}`;
  const slotQuery = Object.fromEntries(SLOTS.map((k, i) => [k, picked[i]!]));
  // «مقایسه‌ی کالاها» (client, 2026-10-28): the side panel's products on one chart, as % change over the range.
  const compareView = q.view === "compare";
  const chartHref = (qq: Record<string, string>) => ({ pathname: "/chart", query: { series: row.series.slug, range, unit, ...slotQuery, ...(compareView ? { view: "compare" } : {}), ...qq } });
  const compareLines: CompareLine[] = compare.flatMap((c, i) =>
    c && !c.locked && c.points.length > 1 ? [{ key: SLOTS[i]!, name: c.row.series.product.name, color: COMPARE_COLORS[i]!, points: c.points }] : [],
  );
  const firstEmpty = SLOTS.find((_, i) => !picked[i]);
  const openHref = (r: PriceRow) => chartHref({ series: r.series.slug, metal: r.series.metal.slug, cat: catOf(r) });
  const lockedPlan = "locked" in history && history.locked ? history.locked.plan : null;
  // chart.full: the price is visible but its history is paid; prices.full: the price itself is.
  const lockedText = (plan: string, historyOnly: boolean) => t(historyOnly ? "lockedHistory" : "lockedSeries", { plan: tl(`plan.${plan}`) });
  const historyOnly = "locked" in history && history.locked ? history.locked.feature === "chart.full" : false;
  const related = (await getArticles(locale, { type: ["analysis", "forecast"], metal: row.series.metal.slug, limit: 3 }))?.items ?? [];

  const rangeNav = (
    <nav className="flex gap-1 overflow-x-auto whitespace-nowrap px-5 pt-4 [scrollbar-width:none] sm:flex-wrap" aria-label="range">
      {RANGES.map((r) =>
        rangeAllowed(r) ? (
          <Link
            key={r}
            href={chartHref({ range: r })}
            aria-current={r === range ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1 text-xs font-bold ${r === range ? "bg-graphite text-white" : "text-text-2 hover:bg-surface-2"}`}
          >
            {t(`ranges.${r}`)}
          </Link>
        ) : (
          <Link key={r} href="/plans" title={t("lockedRange", { plan: tl("plan.silver") })} className="flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs text-text-3 hover:bg-surface-2">
            <LockIcon className="h-3.5 w-3.5" />
            {t(`ranges.${r}`)}
          </Link>
        ),
      )}
    </nav>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-text-2">{t("subtitle")}</p>
      </header>

      <nav aria-label={t("viewLabel")} className="mb-4 flex gap-1">
        {([["", t("viewSingle")], ["compare", t("viewCompare")]] as const).map(([v, name]) => {
          const on = (v === "compare") === compareView;
          return (
            <Link key={v || "single"} href={v ? chartHref({ view: v }) : { pathname: "/chart", query: Object.fromEntries(Object.entries(chartHref({}).query).filter(([key]) => key !== "view")) }} aria-current={on ? "page" : undefined}
              className={`rounded-lg border px-4 py-1.5 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface text-text-2 hover:border-gold"}`}>
              {name}
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          {compareView ? (
            <section className="rounded-card border border-border bg-surface shadow-soft">
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                <span className="text-sm text-text-2">{t("comparing")}</span>
                {SLOTS.map((k, i) => {
                  const c = compare[i];
                  if (!c) return null;
                  const pts = c.points;
                  const bp = pts.length > 1 && pts[0]!.v ? Math.trunc(((pts[pts.length - 1]!.v - pts[0]!.v) * 10_000) / pts[0]!.v) : null;
                  return (
                    <span key={k} className="inline-flex items-center gap-1.5 rounded-full border-2 bg-surface px-2.5 py-1 text-sm" style={{ borderColor: COMPARE_COLORS[i] }}>
                      <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
                      {c.row.series.product.name}
                      {c.locked ? (
                        <Link href="/plans" className="flex items-center gap-1 text-xs font-bold text-gold-dark hover:underline"><LockIcon className="h-3.5 w-3.5" />{tl(`plan.${c.locked}`)}</Link>
                      ) : bp !== null && (
                        <b className={`text-xs tabular-nums ${bp >= 0 ? "text-up" : "text-down"}`} dir="ltr">{formatBp(bp, locale)}</b>
                      )}
                      <Link href={chartHref({ [k]: "" })} aria-label={t("compareRemove", { name: c.row.series.product.name })} className="ms-0.5 px-1 text-text-3 hover:text-down">×</Link>
                    </span>
                  );
                })}
                {firstEmpty && (
                  <form action={locale === "en" ? "/en/chart" : "/chart"} className="inline-flex">
                    {Object.entries(chartHref({}).query).filter(([key]) => key !== firstEmpty).map(([key, v]) => <input key={key} type="hidden" name={key} value={String(v)} />)}
                    <AutoSubmitSelect name={firstEmpty} value="" label={t("compareAdd")} hideLabel>
                      <option value="">{t("compareAdd")}</option>
                      {groups.map(([group, list]) => (
                        <optgroup key={group} label={group}>
                          {list.filter((r) => !picked.includes(r.series.slug)).map((r) => <option key={r.series.slug} value={r.series.slug}>{optionName(r)}</option>)}
                        </optgroup>
                      ))}
                    </AutoSubmitSelect>
                    <noscript><button className="ms-2 rounded-control bg-graphite px-3 py-1 text-sm text-white">OK</button></noscript>
                  </form>
                )}
              </div>
              {rangeNav}
              <div className="p-5">
                {compareLines.length ? (
                  <CompareChart lines={compareLines} locale={locale} intraday={compareRange === "1D" || compareRange === "1W"} />
                ) : (
                  <p className="py-16 text-center text-text-2">{t("compareEmpty")}</p>
                )}
                <p className="mt-3 text-xs text-text-3">{t("compareNote")}</p>
                {lockedPlanName && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-text-2">
                    <LockIcon className="h-4 w-4 shrink-0" />
                    {t("compareFree", { plan: lockedPlanName })}
                    <Link href="/plans" className="font-bold text-gold-dark hover:underline">{tl("upgrade", { plan: lockedPlanName })}</Link>
                  </p>
                )}
              </div>
            </section>
          ) : (
          <>
          <form action={locale === "en" ? "/en/chart" : "/chart"} className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4 shadow-soft">
            <input type="hidden" name="range" value={range} />
            {SLOTS.map((k, i) => <input key={k} type="hidden" name={k} value={picked[i]} />)}
            <AutoSubmitSelect name="metal" value={metal} label={t("metal")}>
              {metals.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
            </AutoSubmitSelect>
            <AutoSubmitSelect name="cat" value={cat} label={t("category")}>
              {cats.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
            </AutoSubmitSelect>
            <AutoSubmitSelect name="series" value={row.series.slug} label={t("product")}>
              {products.map((r) => (
                <option key={r.series.slug} value={r.series.slug}>
                  {r.series.product.name} — {r.series.market.name}
                  {chartLocked(r) ? ` (${t("lockedOption", { plan: lockedPlanName || tl("plan.silver") })})` : ""}
                </option>
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

            {rangeNav}

            <div className="p-5">
              {lockedPlan ? (
                <Locked plan={lockedPlan} title={`${row.series.product.name} — ${row.series.market.name}`}>{lockedText(lockedPlan, historyOnly)}</Locked>
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
          </>
          )}

          {/* The analyses about this metal (client, 2026-10-28): titles and summaries for everyone, the text stays Gold.
              Nothing when there are none; the full list lives under «پیش‌بینی و تحلیل». */}
          {related.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 className="font-bold">{t("relatedTitle", { metal: row.series.metal.name })}</h2>
                <Link href={{ pathname: "/analysis", query: { metal: row.series.metal.slug } }} className="text-sm font-bold text-gold-dark hover:text-gold">
                  {t("relatedAll", { metal: row.series.metal.name })}
                </Link>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {related.map((a) => (
                  <li key={a.slug} className="flex"><div className="flex w-full flex-col [&>article]:flex-1"><InsightCard a={a} locale={locale} /></div></li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="min-w-0">
          <h2 className="mb-1 text-sm font-bold">{t("compareTitle")}</h2>
          <p className="mb-3 text-xs text-text-3">{t("compareHint")}</p>
          <form action={locale === "en" ? "/en/chart" : "/chart"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <input type="hidden" name="series" value={row.series.slug} />
            <input type="hidden" name="metal" value={metal} />
            <input type="hidden" name="cat" value={cat} />
            <input type="hidden" name="range" value={range} />
            <input type="hidden" name="unit" value={unit} />
            {compareView && <input type="hidden" name="view" value="compare" />}
            {SLOTS.map((k, i) => {
              const c = compare[i];
              return (
                <div key={k} className={`rounded-card border bg-surface p-3 shadow-soft ${c && c.row.series.slug === row.series.slug ? "border-gold" : "border-border"}`}>
                  <AutoSubmitSelect name={k} value={picked[i]!} label={t("compareSlot", { n: i + 1 })}>
                    <option value="">{t("compareNone")}</option>
                    {groups.map(([group, list]) => (
                      <optgroup key={group} label={group}>
                        {list.map((r) => <option key={r.series.slug} value={r.series.slug}>{optionName(r)}</option>)}
                      </optgroup>
                    ))}
                  </AutoSubmitSelect>
                  {c && (
                    <Link href={openHref(c.row)} className="mt-2 block rounded-md hover:bg-surface-2" aria-label={t("compareOpen", { name: c.row.series.product.name })}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-bold">{c.row.series.metal.name} · {catLabel(catOf(c.row))}</span>
                        <span className="shrink-0 tabular-nums">
                          {c.row.price ? (c.row.series.currency === "USD" ? "$" : "") + formatPriceValue(c.row.price, locale) : "—"}
                        </span>
                      </div>
                      {c.locked ? <p className="mt-2 text-xs text-text-3">{lockedText(c.locked, c.lockedHistory)}</p> : <Sparkline values={c.values} className="mt-1 h-14 w-full" />}
                    </Link>
                  )}
                </div>
              );
            })}
            <noscript>
              <button className="rounded-control bg-graphite px-4 py-2 text-sm text-white">OK</button>
            </noscript>
          </form>
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

/** Picker categories, in this order: a global price is its own category whatever its product. */
const CATS = ["global", "intermediate", "scrap", "raw"] as const;
type Cat = (typeof CATS)[number];
function catOf(r: PriceRow): Cat {
  if (r.series.market.scope === "global") return "global";
  const c = r.series.category.slug;
  return c === "intermediate" || c === "scrap" ? c : "raw";
}

function uniqueBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
}

/** Option groups "metal · category" (e.g. «مس · ضایعات», «مس · قیمت جهانی»), in the API's order. */
function groupByMetalAndCategory(rows: PriceRow[], label: (c: Cat) => string): [string, PriceRow[]][] {
  const m = new Map<string, PriceRow[]>();
  for (const r of rows) {
    const key = `${r.series.metal.name} · ${label(catOf(r))}`;
    m.set(key, [...(m.get(key) ?? []), r]);
  }
  return [...m];
}
