"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatChangeValue, formatDate, formatPriceValue, formatTime, tehranDaysAgo, type Locale, type PriceDisplay } from "@alanfelez/ui/format";
import { Link, useRouter } from "@/i18n/navigation";
import { LockIcon } from "@/components/LockIcon";
import { useLive } from "./LivePrices";
import { ChangePill } from "./ChangePill";
import { MetalIcon } from "./MetalIcon";

type Row = Schemas["PriceRow"];
type Series = Schemas["SeriesRef"];
type Sort = "" | "up" | "down";

/** The unit a row's price is shown in, in words: «تومان/کیلوگرم», «ریال/تن», «دلار/تن» (USD/ton stays as it is). */
function useUnitLabel() {
  const t = useTranslations("prices");
  return (s: Pick<Series, "currency">, d: PriceDisplay) =>
    s.currency === "USD" ? t("unitLabel.usd") : `${t(d.rial ? "unitLabel.rial" : "unitLabel.toman")}/${t(d.perTon ? "units.ton" : "units.kg")}`;
}

/** "Last updated": the time for today's prices, «دیروز ۱۲:۱۷» for yesterday's, the date for older ones (client, 2026-10-28). */
function useUpdated() {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  return (iso?: string) => {
    if (!iso) return "—";
    const days = tehranDaysAgo(iso);
    if (days <= 0) return formatTime(iso, locale);
    if (days === 1) return t("yesterday", { time: formatTime(iso, locale) });
    return formatDate(iso, locale);
  };
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-text-3 group-hover:text-gold-dark" aria-hidden>
      <path d="M4 19h16M6 15l4-4 3 3 5-6" className="fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Colours that tell the groups of one table apart (client, 2026-11-17: every group in the same cream was hard to tell
 * apart): cream, blue, grey in turn. Full class names, so Tailwind keeps them.
 */
const TONES = [
  { head: "border-gold/30 bg-gold/10", bar: "bg-gold", text: "text-gold-dark", fold: "border-gold/30 bg-gold/[0.06] hover:bg-gold/10", card: "bg-gold/[0.06] active:bg-gold/10", row: "bg-gold/[0.025] [&>td:first-child]:border-s-4 [&>td:first-child]:border-gold/40", li: "border-s-4 border-gold/40 bg-gold/[0.025]" },
  { head: "border-info/25 bg-info/10", bar: "bg-info", text: "text-info", fold: "border-info/25 bg-info/[0.06] hover:bg-info/10", card: "bg-info/[0.06] active:bg-info/10", row: "bg-info/[0.025] [&>td:first-child]:border-s-4 [&>td:first-child]:border-info/40", li: "border-s-4 border-info/40 bg-info/[0.025]" },
  { head: "border-silver/30 bg-silver/15", bar: "bg-silver", text: "text-graphite-2", fold: "border-silver/30 bg-silver/[0.09] hover:bg-silver/15", card: "bg-silver/[0.09] active:bg-silver/15", row: "bg-silver/[0.04] [&>td:first-child]:border-s-4 [&>td:first-child]:border-silver/50", li: "border-s-4 border-silver/50 bg-silver/[0.04]" },
] as const;
type Tone = (typeof TONES)[number];

function PriceRowView({ row, display, child }: { row: Row; display: PriceDisplay; child?: Tone }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const unit = useUnitLabel();
  const updated = useUpdated();
  const router = useRouter();
  const live = useLive(row.series.slug, row);
  const s = row.series;
  const chart = { pathname: "/chart", query: { series: s.slug } };
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  const usd = s.currency === "USD";
  // The whole row opens the chart; the product name stays a real link for keyboards and screen readers.
  return (
    <tr className={`group cursor-pointer border-t border-border hover:bg-surface-2 ${child?.row ?? ""}`} onClick={() => router.push(chart)}>
      <td className="px-4 py-3 font-bold">
        <span className="flex items-center gap-2">
          <MetalIcon slug={s.metal.slug} className="h-8 w-8" />
          {s.metal.name}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link href={chart} title={t("openChart")} className="inline-flex items-center gap-1.5 group-hover:text-gold-dark" onClick={(e) => e.stopPropagation()}>
          {s.product.name}
          <ChartIcon />
        </Link>
      </td>
      <td key={live?.tick} className={`px-4 py-3 text-base font-extrabold tabular-nums ${flash}`}>
        {live ? `${usd ? "$" : ""}${formatPriceValue(live.price, locale, display)}` : t("noData")}
      </td>
      <td className="px-4 py-3 text-text-2">{unit(s, display)}</td>
      <td className={`px-4 py-3 tabular-nums ${Number(live?.change?.bp ?? 0) >= 0 ? "text-up" : "text-down"}`} dir="ltr">
        {live?.change ? formatChangeValue(live.change.amount, s, locale, display) : "—"}
      </td>
      <td className="px-4 py-3"><ChangePill bp={live?.change?.bp} locale={locale} size="sm" /></td>
      <td className="px-4 py-3 whitespace-nowrap text-text-3 tabular-nums">{updated(live?.observedAt)}</td>
      <td className="px-4 py-3 text-text-3">{row.source ?? s.market.name}</td>
    </tr>
  );
}

/** A series the caller's plan doesn't include: its name and market, the price replaced by 🔒 + the plan (no price exists here). */
function LockedRowView({ s, plan, display }: { s: Series; plan: string; display: PriceDisplay }) {
  const unit = useUnitLabel();
  return (
    <tr className="border-t border-border bg-gold/[0.03] text-text-2">
      <td className="px-4 py-3 font-bold">
        <span className="flex items-center gap-2 opacity-70">
          <MetalIcon slug={s.metal.slug} className="h-8 w-8" />
          {s.metal.name}
        </span>
      </td>
      <td className="px-4 py-3">{s.product.name}</td>
      <td className="px-4 py-3">
        <Link href="/plans" className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-2.5 py-0.5 text-xs font-bold text-gold-dark hover:bg-gold/10">
          <LockIcon className="h-4 w-4" />
          {plan}
        </Link>
      </td>
      <td className="px-4 py-3">{unit(s, display)}</td>
      <td className="px-4 py-3 text-text-3">—</td>
      <td className="px-4 py-3 text-text-3">—</td>
      <td className="px-4 py-3 text-text-3">—</td>
      <td className="px-4 py-3 text-text-3">{s.market.name}</td>
    </tr>
  );
}

/** Phone layout of one row: the whole card opens the chart; product and price on top, change and source/time below. */
function PriceCardView({ row, display, child }: { row: Row; display: PriceDisplay; child?: Tone }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const unit = useUnitLabel();
  const updated = useUpdated();
  const live = useLive(row.series.slug, row);
  const s = row.series;
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  return (
    <li className={child?.li ?? ""}>
      <Link href={{ pathname: "/chart", query: { series: s.slug } }} className="group block px-4 py-3 active:bg-surface-2">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <MetalIcon slug={s.metal.slug} className="h-10 w-10" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-bold"><span className="truncate">{s.product.name}</span><ChartIcon /></span>
              <span className="text-xs text-text-3">{s.metal.name} · {unit(s, display)}</span>
            </span>
          </span>
          <span key={live?.tick} className={`shrink-0 rounded-md text-end text-base font-extrabold tabular-nums ${flash}`}>
            {live ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue(live.price, locale, display)}` : t("noData")}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-text-3">
          <span className="truncate">{row.source ?? s.market.name} · {updated(live?.observedAt)}</span>
          <ChangePill bp={live?.change?.bp} locale={locale} size="sm" />
        </div>
      </Link>
    </li>
  );
}

function LockedCardView({ s, plan }: { s: Series; plan: string }) {
  return (
    <li className="bg-gold/[0.03] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <MetalIcon slug={s.metal.slug} className="h-10 w-10 opacity-70" />
          <span className="min-w-0">
            <span className="block truncate font-bold text-text-2">{s.product.name}</span>
            <span className="text-xs text-text-3">{s.metal.name} · {s.market.name}</span>
          </span>
        </span>
        <Link href="/plans" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gold/50 px-2.5 py-0.5 text-xs font-bold text-gold-dark">
          <LockIcon className="h-4 w-4" />
          {plan}
        </Link>
      </div>
    </li>
  );
}

type Item = { kind: "row"; row: Row } | { kind: "locked"; s: Series };
type Section = { key: string; title?: string; items: Item[] };

/**
 * The boxes of one metal's table (client, 2026-11-01): within each category, its groups in their order («آلومینیوم نرم»,
 * «آلومینیوم خشک», …), then the category's products without a group under «سایر …» (a category with no groups is one
 * box under its own name). Only when some product has a group;
 * otherwise one untitled section, as before.
 */
/** 0 world price, 1 IME, 2 everything else: the order of the boxes on a metal's table (client, 2026-11-17). */
function marketRank(s: Series): number {
  return s.market.scope === "global" ? 0 : s.market.slug === "ime" ? 1 : 2;
}

function sectionsOf(items: Item[], other: (category: string) => string): Section[] {
  const seriesOf = (it: Item) => (it.kind === "row" ? it.row.series : it.s);
  if (!items.some((it) => seriesOf(it).group)) return [{ key: "all", items }];
  // A category without groups gets its own name as the title; «سایر …» only follows a category's groups.
  const grouped = new Set(items.map(seriesOf).filter((s) => s.group).map((s) => s.category.slug));
  const cats: string[] = [];
  const byKey = new Map<string, Section & { cat: string; sort: number; rank: number }>();
  for (const it of items) {
    const s = seriesOf(it);
    if (!cats.includes(s.category.slug)) cats.push(s.category.slug);
    // IME and world prices outside a group get a box of their own, named after the market.
    const rank = marketRank(s);
    const key = s.group ? `g${s.group.id}` : rank < 2 ? `m-${s.market.slug}` : `o-${s.category.slug}`;
    let sec = byKey.get(key);
    if (!sec) {
      const title = s.group ? s.group.name : rank < 2 ? s.market.name : grouped.has(s.category.slug) ? other(s.category.name) : s.category.name;
      sec = { key, cat: s.category.slug, sort: s.group ? s.group.sort : Number.MAX_SAFE_INTEGER, rank: 2, title, items: [] };
      byKey.set(key, sec);
    }
    sec.items.push(it);
  }
  // A box of world prices comes first, then the IME boxes, then the rest (client, 2026-11-17).
  for (const sec of byKey.values()) sec.rank = Math.max(...sec.items.map((it) => marketRank(seriesOf(it))));
  return [...byKey.values()].sort((a, b) => a.rank - b.rank || (a.rank < 2 ? 0 : cats.indexOf(a.cat) - cats.indexOf(b.cat)) || a.sort - b.sort);
}

/** Groups with at least this many products are shown folded: one row with the average price, opened with a click. */
const FOLD_AT = 5;

/**
 * Many sizes of one product (client, 2026-11-17: نبشی، لوله، قوطی…): a group folds into one row with the average of its
 * prices (the currency of its first priced row), the lowest and highest, and the average daily change.
 */
function summaryOf(items: Item[]) {
  const priced = items.flatMap((it) => (it.kind === "row" && it.row.price ? [it.row] : []));
  const cur = priced[0]?.price?.currency;
  const same = priced.filter((r) => r.price!.currency === cur);
  if (!same.length) return { count: items.length, locked: items.every((it) => it.kind === "locked") };
  const amounts = same.map((r) => BigInt(r.price!.amount));
  const sum = amounts.reduce((a, b) => a + b, 0n);
  const min = amounts.reduce((a, b) => (b < a ? b : a));
  const max = amounts.reduce((a, b) => (b > a ? b : a));
  const changes = same.flatMap((r) => (r.change ? [r.change.bp] : []));
  const p = same[0]!.price!;
  return {
    count: items.length, locked: false, priced: same.length,
    avg: { ...p, amount: (sum / BigInt(same.length)).toString() }, min: { ...p, amount: min.toString() }, max: { ...p, amount: max.toString() },
    bp: changes.length ? Math.round(changes.reduce((a, b) => a + b, 0) / changes.length) : undefined,
    usd: cur === "USD",
    observedAt: same.map((r) => r.observedAt ?? "").sort().at(-1) || undefined,
  };
}

/** Rows in table order with each big group folded into one block where its first product stands (flat lists). */
function blocksOf(items: Item[], seriesOf: (it: Item) => Series): ({ kind: "item"; it: Item } | { kind: "group"; key: string; name: string; items: Item[] })[] {
  const members = new Map<number, Item[]>();
  for (const it of items) {
    const g = seriesOf(it).group;
    if (g) members.set(g.id, [...(members.get(g.id) ?? []), it]);
  }
  const out: ReturnType<typeof blocksOf> = [];
  const done = new Set<number>();
  for (const it of items) {
    const g = seriesOf(it).group;
    if (g && (members.get(g.id)?.length ?? 0) >= FOLD_AT) {
      if (!done.has(g.id)) {
        done.add(g.id);
        out.push({ kind: "group", key: `g${g.id}`, name: g.name, items: members.get(g.id)! });
      }
      continue;
    }
    out.push({ kind: "item", it });
  }
  return out;
}

/** Persian and Arabic letters compare the same (ی/ي, ک/ك), and case doesn't matter, so «كابل» finds «کابل». */
function norm(s: string) {
  return s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").trim();
}

/**
 * Metal prices table (design 07-metal-prices). Values update live; rows come from the server (tier-filtered).
 * `locked` are the series the caller's plan doesn't include (names only, client 2026-10-28), after the priced rows.
 * `display` switches domestic prices between Toman and Rial and per kg or per ton (SCOPE §14; the prices page no longer
 * offers it, client 2026-11-01). `grouped` (one metal shown) puts the rows in their product groups, see sectionsOf.
 * A search box and a sort by daily change (client, 2026-10-28) work in the browser on the rows already here.
 */
export function PriceTable({ rows, locked = [], plan = "", display = {}, grouped = false }: { rows: Row[]; locked?: Series[]; plan?: string; display?: PriceDisplay; grouped?: boolean }) {
  const t = useTranslations("prices");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const locale = useLocale() as Locale;
  const unit = useUnitLabel();
  const updated = useUpdated();
  const match = (s: Series) => !q || norm(`${s.product.name} ${s.metal.name} ${s.market.name}`).includes(norm(q));
  const bp = (r: Row) => r.change?.bp ?? 0;
  const shown = rows.filter((r) => match(r.series));
  if (sort) shown.sort((a, b) => (sort === "up" ? bp(b) - bp(a) : bp(a) - bp(b)));
  const shownLocked = locked.filter(match);
  const nextSort: Record<Sort, Sort> = { "": "up", up: "down", down: "" };
  const arrow = sort === "up" ? "↓" : sort === "down" ? "↑" : "↕";
  const items: Item[] = [...shown.map((row) => ({ kind: "row" as const, row })), ...shownLocked.map((s) => ({ kind: "locked" as const, s }))];
  // A sort by change mixes the groups, so it shows one flat list.
  const sections = grouped && !sort ? sectionsOf(items, (category) => t("otherGroup", { category })) : [{ key: "all", items } as Section];
  const count = (n: number) => t("groupCount", { n });
  const seriesOf = (it: Item) => (it.kind === "row" ? it.row.series : it.s);
  // Folding needs the default order and no search (a search shows the matching sizes themselves).
  const fold = !sort && !q;
  // Each box and folded group takes the next colour, in the order they appear (the phone list and the table agree).
  const tones = new Map<string, Tone>();
  const toneOf = (key: string): Tone => {
    let tone = tones.get(key);
    if (!tone) {
      tone = TONES[tones.size % TONES.length]!;
      tones.set(key, tone);
    }
    return tone;
  };
  // A section that is one big group folds under its own title; a flat list folds each big group where it starts.
  const foldsWhole = (sec: Section) => fold && sec.key.startsWith("g") && sec.items.length >= FOLD_AT;
  const blocks = (sec: Section) => (fold && !sec.key.startsWith("g") ? blocksOf(sec.items, seriesOf) : sec.items.map((it) => ({ kind: "item" as const, it })));
  const firstSeries = (items: Item[]) => seriesOf(items[0]!);
  const price = (m: { amount: string; currency: "IRR" | "USD"; unit: "kg" | "ton" }, usd?: boolean) => `${usd ? "$" : ""}${formatPriceValue(m as never, locale, display)}`;

  // The folded group: name, number of sizes, average price, lowest–highest, average change; a click opens its rows.
  const groupRow = (key: string, name: string, items: Item[], withTitle: boolean) => {
    const sum = summaryOf(items);
    const isOpen = open.has(key);
    const s0 = firstSeries(items);
    const tone = toneOf(key);
    return (
      <tr key={`s-${key}`} className={`cursor-pointer border-t ${tone.fold}`} onClick={() => toggle(key)} aria-expanded={isOpen}>
        <td className="px-4 py-3 font-bold">
          <span className="flex items-center gap-2">
            <MetalIcon slug={s0.metal.slug} className="h-8 w-8" />
            {s0.metal.name}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`flex items-center gap-2 font-extrabold ${tone.text}`}>
            <span aria-hidden className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>‹</span>
            {name}
            <span className="text-xs font-normal text-text-3">({count(sum.count)})</span>
          </span>
        </td>
        <td className="px-4 py-3">
          {sum.avg ? (
            <span className="block">
              <span className="text-xs text-text-3">{t("groupAvg")} </span>
              <span className="text-base font-extrabold tabular-nums">{price(sum.avg, sum.usd)}</span>
              <span className="block text-xs text-text-3 tabular-nums">{t("groupRange", { min: price(sum.min!, sum.usd), max: price(sum.max!, sum.usd) })}</span>
            </span>
          ) : sum.locked ? (
            <Link href="/plans" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-2.5 py-0.5 text-xs font-bold text-gold-dark hover:bg-gold/10"><LockIcon className="h-4 w-4" />{plan}</Link>
          ) : <span className="text-text-3">{t("noData")}</span>}
        </td>
        <td className="px-4 py-3 text-text-2">{unit(s0, display)}</td>
        <td className="px-4 py-3 text-text-3">—</td>
        <td className="px-4 py-3">{sum.bp !== undefined ? <ChangePill bp={sum.bp} locale={locale} size="sm" /> : <span className="text-text-3">—</span>}</td>
        <td className="px-4 py-3 whitespace-nowrap text-text-3 tabular-nums">{updated(sum.observedAt)}</td>
        <td className={`px-4 py-3 text-xs font-bold ${tone.text}`}>{isOpen ? t("groupClose") : t("groupOpen")}</td>
      </tr>
    );
  };
  const groupCard = (key: string, name: string, items: Item[]) => {
    const sum = summaryOf(items);
    const isOpen = open.has(key);
    const s0 = firstSeries(items);
    const tone = toneOf(key);
    return (
      <li key={`s-${key}`}>
        <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} className={`block w-full px-4 py-3 text-start ${tone.card}`}>
          <span className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <MetalIcon slug={s0.metal.slug} className="h-10 w-10" />
              <span className="min-w-0">
                <span className={`flex items-center gap-1.5 font-extrabold ${tone.text}`}><span aria-hidden className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>‹</span><span className="truncate">{name}</span></span>
                <span className="text-xs text-text-3">{count(sum.count)} · {unit(s0, display)}</span>
              </span>
            </span>
            <span className="shrink-0 text-end">
              {sum.avg ? (
                <>
                  <span className="block text-[11px] text-text-3">{t("groupAvg")}</span>
                  <span className="text-base font-extrabold tabular-nums">{price(sum.avg, sum.usd)}</span>
                </>
              ) : sum.locked ? <span className="inline-flex items-center gap-1 text-xs font-bold text-gold-dark"><LockIcon className="h-4 w-4" />{plan}</span> : <span className="text-text-3">{t("noData")}</span>}
            </span>
          </span>
          <span className="mt-1.5 flex items-center justify-between gap-3 text-xs text-text-3">
            <span className="truncate">{sum.avg ? t("groupRange", { min: price(sum.min!, sum.usd), max: price(sum.max!, sum.usd) }) : ""}</span>
            <span className={`font-bold ${tone.text}`}>{isOpen ? t("groupClose") : t("groupOpen")}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <>
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{t("search")}</span>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" aria-hidden>
          <circle cx="11" cy="11" r="6" className="fill-none stroke-current" strokeWidth="2" />
          <path d="m20 20-4.5-4.5" className="fill-none stroke-current" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-surface-2 py-2 ps-9 pe-3 text-sm outline-none focus:border-gold"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-text-2">
        <span className="sr-only sm:not-sr-only">{t("sortBy")}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none focus:border-gold">
          <option value="">{t("sort.default")}</option>
          <option value="up">{t("sort.up")}</option>
          <option value="down">{t("sort.down")}</option>
        </select>
      </label>
    </div>
    {shown.length === 0 && shownLocked.length === 0 && <p className="p-8 text-center text-sm text-text-2">{t("noMatch")}</p>}
    <ul className="divide-y divide-border md:hidden">
      {sections.map((sec) => {
        const card = (it: Item, child?: Tone) => (it.kind === "row" ? <PriceCardView key={it.row.series.slug} row={it.row} display={display} child={child} /> : <LockedCardView key={it.s.slug} s={it.s} plan={plan} />);
        if (foldsWhole(sec)) return [groupCard(sec.key, sec.title ?? "", sec.items), ...(open.has(sec.key) ? sec.items.map((it) => card(it, toneOf(sec.key))) : [])];
        return [
          sec.title && (
            <li key={`h-${sec.key}`} className={`flex items-center justify-between gap-2 px-4 py-2.5 ${toneOf(sec.key).head}`}>
              <span className={`flex items-center gap-2 font-extrabold ${toneOf(sec.key).text}`}><span aria-hidden className={`h-4 w-1 rounded-full ${toneOf(sec.key).bar}`} />{sec.title}</span>
              <span className="text-xs text-text-3">{count(sec.items.length)}</span>
            </li>
          ),
          ...blocks(sec).flatMap((b) => (b.kind === "item" ? [card(b.it)] : [groupCard(b.key, b.name, b.items), ...(open.has(b.key) ? b.items.map((it) => card(it, toneOf(b.key))) : [])])),
        ];
      })}
    </ul>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-start text-sm">
        <thead className="bg-surface-2 text-xs text-text-2">
          <tr>
            <th className="px-4 py-3 text-start font-bold">{t("col.metal")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.type")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.priceOnly")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.unit")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.change")}</th>
            <th className="px-4 py-3 text-start font-bold" aria-sort={sort === "up" ? "descending" : sort === "down" ? "ascending" : "none"}>
              <button type="button" onClick={() => setSort(nextSort[sort])} className="inline-flex items-center gap-1 font-bold hover:text-gold-dark" title={t("sortBy")}>
                {t("col.changePct")} <span aria-hidden>{arrow}</span>
              </button>
            </th>
            <th className="px-4 py-3 text-start font-bold">{t("col.updated")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.source")}</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => {
            const line = (it: Item, child?: Tone) => (it.kind === "row" ? <PriceRowView key={it.row.series.slug} row={it.row} display={display} child={child} /> : <LockedRowView key={it.s.slug} s={it.s} plan={plan} display={display} />);
            if (foldsWhole(sec)) return [groupRow(sec.key, sec.title ?? "", sec.items, true), ...(open.has(sec.key) ? sec.items.map((it) => line(it, toneOf(sec.key))) : [])];
            return [
            sec.title && (
              <tr key={`h-${sec.key}`} className={`border-t ${toneOf(sec.key).head}`}>
                <td colSpan={8} className="px-4 py-2.5">
                  <span className={`flex items-center gap-2 font-extrabold ${toneOf(sec.key).text}`}>
                    <span aria-hidden className={`h-4 w-1 rounded-full ${toneOf(sec.key).bar}`} />
                    {sec.title}
                    <span className="text-xs font-normal text-text-3">({count(sec.items.length)})</span>
                  </span>
                </td>
              </tr>
            ),
            ...blocks(sec).flatMap((b) => (b.kind === "item" ? [line(b.it)] : [groupRow(b.key, b.name, b.items, false), ...(open.has(b.key) ? b.items.map((it) => line(it, toneOf(b.key))) : [])])),
            ];
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
