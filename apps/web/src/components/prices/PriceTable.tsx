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
 * One look for every group (client, 2026-11-18: alternating colours made it hard to see what was open): the rows of an
 * open group sit behind a gold line on the start edge. Full class names, so Tailwind keeps them.
 */
const CHILD = { row: "[&>td:first-child]:border-s-4 [&>td:first-child]:border-gold-light", li: "border-s-4 border-gold-light" } as const;
type Tone = typeof CHILD;

/** The open/closed arrow in a circle: down when closed, up (gold) when open (NN/g: the caret is the clearest sign). */
function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-[1.5px] ${open ? "border-gold-light bg-gold-light text-graphite" : "border-border-strong text-graphite-2"}`}>
      <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 6l4.5 4.5L12.5 6" />
      </svg>
    </span>
  );
}

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

/**
 * In a list of several metals, groups with at least this many products fold into one row. On one metal's table every
 * box folds, however small (client, 2026-11-17: «بیلت و مفتول» too): all closed at first (client, 2026-11-18).
 */
const FOLD_AT = 2;

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

/** Columns of a row inside a group card (desktop): product, price, change, %, updated, source. The header row uses the same. */
const LINE_COLS = "md:grid md:grid-cols-[minmax(0,2.6fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)] md:items-center md:gap-3";

/** One product inside an open group card: the whole line opens the chart. Phone: name and price, then time and change. */
function GroupLine({ row, display }: { row: Row; display: PriceDisplay }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const unit = useUnitLabel();
  const updated = useUpdated();
  const live = useLive(row.series.slug, row);
  const s = row.series;
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  return (
    <li className="border-t border-border even:bg-surface-2">
      <Link href={{ pathname: "/chart", query: { series: s.slug } }} title={t("openChart")}
        className={`group grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-gold/5 md:py-3 ${LINE_COLS}`}>
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong md:ms-3 md:h-2 md:w-2" />
          <span className="min-w-0 group-hover:text-gold-dark">{s.product.name}</span>
          <ChartIcon />
        </span>
        <span key={live?.tick} className={`text-end md:text-start ${flash}`}>
          <span className="text-base font-extrabold tabular-nums">{live ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue(live.price, locale, display)}` : t("noData")}</span>
          <span className="block text-[11px] text-text-3">{unit(s, display)}</span>
        </span>
        <span className={`hidden tabular-nums md:block ${Number(live?.change?.bp ?? 0) >= 0 ? "text-up" : "text-down"}`} dir="ltr">
          {live?.change ? formatChangeValue(live.change.amount, s, locale, display) : "—"}
        </span>
        <span className="order-last justify-self-end md:order-none md:justify-self-start"><ChangePill bp={live?.change?.bp} locale={locale} size="sm" /></span>
        <span className="truncate text-xs text-text-3 tabular-nums md:whitespace-normal md:text-sm">
          {updated(live?.observedAt)}<span className="md:hidden"> · {row.source ?? s.market.name}</span>
        </span>
        <span className="hidden text-text-3 md:block">{row.source ?? s.market.name}</span>
      </Link>
    </li>
  );
}

/** A product of an open group the caller's plan doesn't include: its name and a 🔒 link to the plans. */
function GroupLockedLine({ s, plan }: { s: Series; plan: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t border-border bg-gold/[0.03] px-4 py-2.5 text-sm text-text-2">
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong md:ms-3 md:h-2 md:w-2" />
        <span className="truncate">{s.product.name}</span>
      </span>
      <Link href="/plans" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gold/50 px-2.5 py-0.5 text-xs font-bold text-gold-dark hover:bg-gold/10">
        <LockIcon className="h-4 w-4" />
        {plan}
      </Link>
    </li>
  );
}

/** The small market label next to a group's name (client, 2026-11-18: the market is told by a label, not by colours). */
function MarketBadge({ s }: { s: Series }) {
  const tone = s.market.scope === "global" ? "bg-gold/15 text-gold-dark" : s.market.slug === "ime" ? "bg-info-bg text-info" : "bg-surface-2 text-text-2 border border-border";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{s.market.name}</span>;
}

/**
 * Metal prices table (design 07-metal-prices). Values update live; rows come from the server (tier-filtered).
 * `locked` are the series the caller's plan doesn't include (names only, client 2026-10-28), after the priced rows.
 * `display` switches domestic prices between Toman and Rial and per kg or per ton (SCOPE §14; the prices page no longer
 * offers it, client 2026-11-01). `grouped` (one metal shown) puts the rows in their product groups, see sectionsOf,
 * each group a card of its own that opens and closes (client, 2026-11-18).
 * A search box and a sort by daily change (client, 2026-10-28) work in the browser on the rows already here.
 */
export function PriceTable({ rows, locked = [], plan = "", display = {}, grouped = false }: { rows: Row[]; locked?: Series[]; plan?: string; display?: PriceDisplay; grouped?: boolean }) {
  const t = useTranslations("prices");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("");
  // «باز کردن همه» / «بستن همه» set every box; without them every box starts closed (client, 2026-11-18).
  const [all, setAll] = useState<"" | "open" | "closed">("");
  // The boxes the reader opened or closed one by one since.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setFlipped((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const setEvery = (to: "open" | "closed") => { setAll(to); setFlipped(new Set()); };
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
  // A search shows the matching products themselves, so every box with a match is open.
  const opened = (key: string, _items: Item[]) => !!q || flipped.has(key) !== (all === "open");
  // Folding (flat lists) needs the default order and no search.
  const fold = !sort && !q;
  const blocks = (sec: Section) => (fold && !sec.key.startsWith("g") ? blocksOf(sec.items, seriesOf) : sec.items.map((it) => ({ kind: "item" as const, it })));
  const firstSeries = (items: Item[]) => seriesOf(items[0]!);
  const price = (m: { amount: string; currency: "IRR" | "USD"; unit: "kg" | "ton" }, usd?: boolean) => `${usd ? "$" : ""}${formatPriceValue(m as never, locale, display)}`;
  // An average only means something for the sizes of one product (a group), not for a category's mixed products.
  const summary = (key: string, items: Item[]) => (key.startsWith("g") ? summaryOf(items) : { ...summaryOf(items), avg: undefined, bp: undefined, locked: false });

  const toolbar = (
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
  );
  const none = shown.length === 0 && shownLocked.length === 0 && <p className="p-8 text-center text-sm text-text-2">{t("noMatch")}</p>;

  // One metal with product groups (client, 2026-11-18): every group is a card of its own with a clear header — dark with a
  // gold arrow when open, white with a down arrow when closed — under «قیمت جهانی و بورس کالا» and «بازار آزاد».
  if (sections[0]?.title) {
    const top = sections.filter((sec) => sec.items.every((it) => marketRank(seriesOf(it)) < 2));
    const rest = sections.filter((sec) => !top.includes(sec));
    const card = (sec: Section) => {
      const isOpen = opened(sec.key, sec.items);
      const sum = summary(sec.key, sec.items);
      const s0 = firstSeries(sec.items);
      const oneMarket = sec.items.every((it) => seriesOf(it).market.slug === s0.market.slug) && sec.title !== s0.market.name;
      const id = `grp-${sec.key}`;
      return (
        <section key={sec.key} className="overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
          <button type="button" onClick={() => toggle(sec.key)} aria-expanded={isOpen} aria-controls={id}
            className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-3 text-start sm:px-4 ${isOpen ? "bg-graphite text-white" : "hover:bg-surface-2"}`}>
            <Chevron open={isOpen} />
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="text-base font-extrabold">{sec.title}</span>
              {oneMarket && <MarketBadge s={s0} />}
              <span className={`text-xs ${isOpen ? "text-white/60" : "text-text-3"}`}>{count(sum.count)}</span>
            </span>
            <span className={`flex w-full items-center justify-between gap-4 ps-10 text-xs sm:w-auto sm:ps-0 ${isOpen ? "text-white/70" : "text-text-2"}`}>
              {sum.avg ? (
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  {t("groupAvg")}
                  <span className={`text-sm font-extrabold tabular-nums ${isOpen ? "text-white" : "text-text"}`}>{price(sum.avg, sum.usd)}</span>
                  {unit(s0, display)}
                  <span className="hidden tabular-nums lg:inline">· {t("groupRange", { min: price(sum.min!, sum.usd), max: price(sum.max!, sum.usd) })}</span>
                </span>
              ) : sum.locked ? (
                <span className="inline-flex items-center gap-1 font-bold text-gold-dark"><LockIcon className="h-4 w-4" />{plan}</span>
              ) : <span />}
              <span className={`shrink-0 font-bold ${isOpen ? "text-gold-light" : "text-info"}`}>{isOpen ? t("groupClose") : t("groupShow", { n: sum.count })}</span>
            </span>
          </button>
          {isOpen && (
            <ul id={id} className="border-s-4 border-gold-light">
              {sec.items.map((it) => (it.kind === "row" ? <GroupLine key={it.row.series.slug} row={it.row} display={display} /> : <GroupLockedLine key={it.s.slug} s={it.s} plan={plan} />))}
            </ul>
          )}
        </section>
      );
    };
    const part = (title: string, secs: Section[], heading: boolean) => secs.length > 0 && (
      <div className="space-y-2.5">
        {heading && (
          <h2 className="flex items-center gap-2 pt-1 text-sm font-extrabold text-text-2">
            {title}
            <span aria-hidden className="h-px flex-1 bg-border-strong" />
          </h2>
        )}
        {secs.map(card)}
      </div>
    );
    const both = top.length > 0 && rest.length > 0;
    return (
      <>
        {toolbar}
        <div className="space-y-4 bg-bg p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-text-2">{t("groupsTotal", { groups: sections.length, n: items.length })}</span>
            {!q && (
              <span className="flex gap-2">
                <button type="button" onClick={() => setEvery("open")} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-graphite-2 hover:border-gold">{t("openAll")}</button>
                <button type="button" onClick={() => setEvery("closed")} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-graphite-2 hover:border-gold">{t("closeAll")}</button>
              </span>
            )}
          </div>
          {none}
          <div aria-hidden className={`hidden px-4 text-xs font-bold text-text-3 ${LINE_COLS}`}>
            <span className="ps-7">{t("col.type")}</span>
            <span>{t("col.priceOnly")}</span>
            <span>{t("col.change")}</span>
            <span>{t("col.changePct")}</span>
            <span>{t("col.updated")}</span>
            <span>{t("col.source")}</span>
          </div>
          {part(t("sectionTop"), top, both)}
          {part(t("sectionRest"), rest, both)}
        </div>
      </>
    );
  }

  // The folded group of a flat list: name, number of sizes, average price, lowest–highest, average change; a click opens its rows.
  const groupRow = (key: string, name: string, items: Item[]) => {
    const isOpen = opened(key, items);
    const sum = summary(key, items);
    const s0 = firstSeries(items);
    return (
      <tr key={`s-${key}`} className={`cursor-pointer border-t border-border ${isOpen ? "bg-graphite text-white" : "bg-surface-2 hover:bg-gold/5"}`} onClick={() => toggle(key)} aria-expanded={isOpen}>
        <td className="px-4 py-3 font-bold">
          <span className="flex items-center gap-2">
            <MetalIcon slug={s0.metal.slug} className="h-8 w-8" />
            {s0.metal.name}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="flex items-center gap-2 font-extrabold">
            <Chevron open={isOpen} />
            {name}
            <span className={`text-xs font-normal ${isOpen ? "text-white/60" : "text-text-3"}`}>({count(sum.count)})</span>
          </span>
        </td>
        <td className="px-4 py-3">
          {sum.avg ? (
            <span className="block">
              <span className={`text-xs ${isOpen ? "text-white/60" : "text-text-3"}`}>{t("groupAvg")} </span>
              <span className="text-base font-extrabold tabular-nums">{price(sum.avg, sum.usd)}</span>
              <span className={`block text-xs tabular-nums ${isOpen ? "text-white/60" : "text-text-3"}`}>{t("groupRange", { min: price(sum.min!, sum.usd), max: price(sum.max!, sum.usd) })}</span>
            </span>
          ) : sum.locked ? (
            <Link href="/plans" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-2.5 py-0.5 text-xs font-bold text-gold-dark hover:bg-gold/10"><LockIcon className="h-4 w-4" />{plan}</Link>
          ) : <span className="text-text-3">{t("noData")}</span>}
        </td>
        <td className={`px-4 py-3 ${isOpen ? "text-white/70" : "text-text-2"}`}>{unit(s0, display)}</td>
        <td className="px-4 py-3 text-text-3">—</td>
        <td className="px-4 py-3">{sum.bp !== undefined ? <ChangePill bp={sum.bp} locale={locale} size="sm" /> : <span className="text-text-3">—</span>}</td>
        <td className={`px-4 py-3 whitespace-nowrap tabular-nums ${isOpen ? "text-white/60" : "text-text-3"}`}>{updated(sum.observedAt)}</td>
        <td className={`px-4 py-3 text-xs font-bold ${isOpen ? "text-gold-light" : "text-info"}`}>{isOpen ? t("groupClose") : t("groupShow", { n: sum.count })}</td>
      </tr>
    );
  };
  const groupCard = (key: string, name: string, items: Item[]) => {
    const isOpen = opened(key, items);
    const sum = summary(key, items);
    const s0 = firstSeries(items);
    return (
      <li key={`s-${key}`}>
        <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} className={`block w-full px-4 py-3 text-start ${isOpen ? "bg-graphite text-white" : "bg-surface-2 active:bg-gold/5"}`}>
          <span className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <Chevron open={isOpen} />
              <span className="min-w-0">
                <span className="block truncate font-extrabold">{name}</span>
                <span className={`text-xs ${isOpen ? "text-white/60" : "text-text-3"}`}>{count(sum.count)} · {unit(s0, display)}</span>
              </span>
            </span>
            <span className="shrink-0 text-end">
              {sum.avg ? (
                <>
                  <span className={`block text-[11px] ${isOpen ? "text-white/60" : "text-text-3"}`}>{t("groupAvg")}</span>
                  <span className="text-base font-extrabold tabular-nums">{price(sum.avg, sum.usd)}</span>
                </>
              ) : sum.locked ? <span className="inline-flex items-center gap-1 text-xs font-bold text-gold-dark"><LockIcon className="h-4 w-4" />{plan}</span> : <span className="text-text-3">{t("noData")}</span>}
            </span>
          </span>
          <span className={`mt-1.5 flex items-center justify-between gap-3 text-xs ${isOpen ? "text-white/60" : "text-text-3"}`}>
            <span className="truncate">{sum.avg ? t("groupRange", { min: price(sum.min!, sum.usd), max: price(sum.max!, sum.usd) }) : ""}</span>
            <span className={`font-bold ${isOpen ? "text-gold-light" : "text-info"}`}>{isOpen ? t("groupClose") : t("groupShow", { n: sum.count })}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <>
    {toolbar}
    {none}
    <ul className="divide-y divide-border md:hidden">
      {sections.map((sec) => {
        const card = (it: Item, child?: Tone) => (it.kind === "row" ? <PriceCardView key={it.row.series.slug} row={it.row} display={display} child={child} /> : <LockedCardView key={it.s.slug} s={it.s} plan={plan} />);
        return blocks(sec).flatMap((b) => (b.kind === "item" ? [card(b.it)] : [groupCard(b.key, b.name, b.items), ...(opened(b.key, b.items) ? b.items.map((it) => card(it, CHILD)) : [])]));
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
            return blocks(sec).flatMap((b) => (b.kind === "item" ? [line(b.it)] : [groupRow(b.key, b.name, b.items), ...(opened(b.key, b.items) ? b.items.map((it) => line(it, CHILD)) : [])]));
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
