"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatPriceValue, type Locale } from "@alanfelez/ui/format";
import { useLive, useLiveMap } from "./LivePrices";
import { ChangePill } from "./ChangePill";

type Row = Schemas["PriceRow"];
type Price = Schemas["Price"];

/**
 * One entry of the bar: a world price, one IME product, or the average of an IME group («شمش آلومینیوم بورس کالا»:
 * client, 2026-11-18, the IME rows became too many to show one by one).
 */
type Entry = { key: string; label: string; world: boolean; rows: Row[] };

function Item({ entry }: { entry: Entry }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const map = useLiveMap();
  const single = useLive(entry.rows[0]!.series.slug, entry.rows[0]);
  const s = entry.rows[0]!.series;
  let price: Price | undefined;
  let bp: number | undefined;
  if (entry.rows.length === 1) {
    price = single?.price;
    bp = single?.change?.bp;
  } else {
    // The average of the group's prices that are in the same currency and unit as the first one, and of their changes.
    const live = entry.rows.flatMap((r) => {
      const v = map[r.series.slug] ?? (r.price && r.observedAt ? { price: r.price, change: r.change } : undefined);
      return v && v.price.currency === s.currency && v.price.unit === s.unit ? [v] : [];
    });
    if (live.length) {
      const sum = live.reduce((a, v) => a + BigInt(v.price.amount), 0n);
      price = { ...live[0]!.price, amount: (sum / BigInt(live.length)).toString() };
      const bps = live.flatMap((v) => (v.change ? [v.change.bp] : []));
      bp = bps.length ? Math.round(bps.reduce((a, b) => a + b, 0) / bps.length) : undefined;
    }
  }
  // Which market and unit each number is (client, 2026-11-01): the same metal appears once for the IME and once world-wide.
  const unit = s.currency === "USD" ? `$/${t(`units.${s.unit}`)}` : `${t("unitLabel.toman")}/${t(`units.${s.unit}`)}`;
  return (
    <li className="flex shrink-0 items-center gap-2 border-e border-graphite-3 px-5 text-xs">
      <span className="text-silver-light">{entry.label}</span>
      <span className={`rounded px-1.5 py-px text-[10px] ${entry.world ? "bg-info/25 text-info-bg" : "bg-gold/25 text-gold-light"}`}>
        {entry.world ? t("tickerWorld") : s.market.slug === "ime" ? t("tickerIme") : s.market.name}
      </span>
      {entry.rows.length > 1 && <span className="text-[10px] text-silver-light">{t("groupAvg")}</span>}
      <span className="font-bold tabular-nums text-white">{price ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue(price, locale)}` : "—"}</span>
      <span className="text-[10px] text-silver-light">{unit}</span>
      <ChangePill bp={bp} locale={locale} size="sm" />
    </li>
  );
}

/** «شمش 1000p-99.8 (آلومینیوم المهدی)» → «شمش 1000p-99.8»; «شمش آلومینیوم بورس کالا» → «شمش آلومینیوم» (the badge says IME). */
const withoutProducer = (name: string) => name.replace(/\s*\([^()]*(\([^()]*\)[^()]*)*\)\s*$/, "").trim() || name;
const withoutIme = (name: string) => name.replace(/\s*بورس کالا\s*$/, "").trim() || name;

/** World prices one by one, IME rows one entry per group (their average); by metal, its world price first. */
function entriesOf(rows: Row[]): Entry[] {
  const out: Entry[] = [];
  const groups = new Map<number, Entry>();
  for (const r of rows) {
    const s = r.series;
    const world = s.market.scope === "global";
    if (!world && s.market.slug === "ime" && s.group) {
      const g = groups.get(s.group.id);
      if (g) g.rows.push(r);
      else {
        const e: Entry = { key: `g${s.group.id}`, label: withoutIme(s.group.name), world, rows: [r] };
        groups.set(s.group.id, e);
        out.push(e);
      }
      continue;
    }
    out.push({ key: s.slug, label: world ? s.metal.name : withoutProducer(s.product.name), world, rows: [r] });
  }
  // Within each metal the world price comes first (rows already come in the metals' order).
  const metals = [...new Set(rows.map((r) => r.series.metal.slug))];
  const metalOf = (e: Entry) => metals.indexOf(e.rows[0]!.series.metal.slug);
  return out.map((e, i) => ({ e, i })).sort((a, b) => metalOf(a.e) - metalOf(b.e) || Number(b.e.world) - Number(a.e.world) || a.i - b.i).map(({ e }) => e);
}

/** The scrolling bar above the header: each metal's world price and IME prices (the base series), updated live. */
export function PriceTicker({ rows }: { rows: Row[] }) {
  const entries = entriesOf(rows.filter((r) => r.series.isBase && r.price));
  if (entries.length === 0) return null;
  return (
    <div className="overflow-hidden border-b border-graphite-2 bg-graphite py-1.5" aria-label="ticker">
      {/* Two copies side by side scroll by half their width, so the loop is seamless. */}
      <ul className="flex w-max animate-ticker hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => entries.map((e) => <Item key={`${copy}-${e.key}`} entry={e} />))}
      </ul>
    </div>
  );
}
