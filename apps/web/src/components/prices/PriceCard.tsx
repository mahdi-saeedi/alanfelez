"use client";

import { useLocale } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatPriceValue, formatTime, priceUnitLabel, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { useLive } from "./LivePrices";
import { ChangePill } from "./ChangePill";
import { MetalIcon } from "./MetalIcon";

/** Home-page card: metal, live price, unit, daily change and time (design 02-home-live-prices). */
export function PriceCard({ row }: { row: Schemas["PriceRow"] }) {
  const locale = useLocale() as Locale;
  const live = useLive(row.series.slug, row);
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  return (
    <Link
      href={{ pathname: "/chart", query: { series: row.series.slug } }}
      className="block rounded-card border border-border bg-surface p-4 shadow-soft transition hover:border-gold"
    >
      <div className="flex items-center gap-2 text-sm text-text-2">
        <MetalIcon slug={row.series.metal.slug} className="h-10 w-10" />
        {row.series.metal.name}
      </div>
      <div key={live?.tick} className={`mt-2 rounded-md text-xl font-extrabold tabular-nums ${flash}`}>
        {live ? formatPriceValue(live.price, locale) : "—"}
      </div>
      <div className="mt-1 text-xs text-text-3" dir="ltr">{priceUnitLabel(row.series, locale)}</div>
      <div className="mt-3"><ChangePill bp={live?.change?.bp} locale={locale} /></div>
      <div className="mt-2 text-xs text-text-3 tabular-nums">{live ? formatTime(live.observedAt, locale) : ""}</div>
    </Link>
  );
}
