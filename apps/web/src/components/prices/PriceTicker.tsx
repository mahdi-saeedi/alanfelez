"use client";

import { useLocale } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatPriceValue, type Locale } from "@alanfelez/ui/format";
import { useLive } from "./LivePrices";
import { ChangePill } from "./ChangePill";

type Row = Schemas["PriceRow"];

function Item({ row }: { row: Row }) {
  const locale = useLocale() as Locale;
  const live = useLive(row.series.slug);
  return (
    <li className="flex shrink-0 items-center gap-2 border-e border-graphite-3 px-5 text-xs">
      <span className="text-silver-light">{row.series.metal.name}</span>
      <span className="font-bold tabular-nums text-white">{live ? formatPriceValue(live.price, locale) : "—"}</span>
      <ChangePill bp={live?.change?.bp} locale={locale} size="sm" />
    </li>
  );
}

/** The scrolling bar above the header: the base price of each metal, updated live. */
export function PriceTicker({ rows }: { rows: Row[] }) {
  const items = rows.filter((r) => r.series.isBase);
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden border-b border-graphite-2 bg-graphite py-1.5" aria-label="ticker">
      {/* Two copies side by side scroll by half their width, so the loop is seamless. */}
      <ul className="flex w-max animate-ticker hover:[animation-play-state:paused]">
        {[0, 1].map((copy) =>
          items.map((r) => <Item key={`${copy}-${r.series.slug}`} row={r} />),
        )}
      </ul>
    </div>
  );
}
