"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatPriceValue, type Locale } from "@alanfelez/ui/format";
import { useLive } from "./LivePrices";
import { ChangePill } from "./ChangePill";

type Row = Schemas["PriceRow"];

function Item({ row }: { row: Row }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const live = useLive(row.series.slug);
  const s = row.series;
  const world = s.market.scope === "global";
  // Which market and unit each number is (client, 2026-11-01): the same metal appears once for the IME and once world-wide.
  const unit = s.currency === "USD" ? `$/${t(`units.${s.unit}`)}` : `${t("unitLabel.toman")}/${t(`units.${s.unit}`)}`;
  return (
    <li className="flex shrink-0 items-center gap-2 border-e border-graphite-3 px-5 text-xs">
      <span className="text-silver-light">{s.metal.name}</span>
      <span className={`rounded px-1.5 py-px text-[10px] ${world ? "bg-info/25 text-info-bg" : "bg-gold/25 text-gold-light"}`}>
        {world ? t("tickerWorld") : s.market.slug === "ime" ? t("tickerIme") : s.market.name}
      </span>
      <span className="font-bold tabular-nums text-white">{live ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue(live.price, locale)}` : "—"}</span>
      <span className="text-[10px] text-silver-light">{unit}</span>
      <ChangePill bp={live?.change?.bp} locale={locale} size="sm" />
    </li>
  );
}

/** The scrolling bar above the header: each metal's IME and world prices (the base series), updated live. */
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
