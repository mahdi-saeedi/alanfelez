"use client";

import { useLocale } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatPriceValue, formatTime, priceUnitLabel, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { useLive } from "./LivePrices";
import { ChangePill } from "./ChangePill";
import { MetalIcon, hasMetalPhoto } from "./MetalIcon";

/**
 * Home-page card: a picture of the metal with its name on it, then the live price, unit, daily change and time below
 * (rendered pictures in public/metals, made by tools/metal-images/render.py). A metal without a picture shows its icon.
 */
export function PriceCard({ row }: { row: Schemas["PriceRow"] }) {
  const locale = useLocale() as Locale;
  const live = useLive(row.series.slug, row);
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  const metal = row.series.metal;
  return (
    <Link
      href={{ pathname: "/chart", query: { series: row.series.slug } }}
      className="group block overflow-hidden rounded-card border border-border bg-surface shadow-soft transition hover:border-gold"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        {hasMetalPhoto(metal.slug) ? (
          <img
            src={`/metals/${metal.slug}.webp`}
            alt={metal.name}
            width={480}
            height={600}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full items-center justify-center"><MetalIcon slug={metal.slug} className="h-24 w-24" /></span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-graphite/70 to-transparent px-4 pb-3 pt-10 text-lg font-extrabold text-white">
          {metal.name}
        </div>
      </div>
      <div className="p-3">
        <div key={live?.tick} className={`rounded-md text-xl font-extrabold tabular-nums ${flash}`}>
          {live ? formatPriceValue(live.price, locale) : "—"}
        </div>
        <div className="text-xs text-text-3" dir="ltr">{priceUnitLabel(row.series, locale)}</div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <ChangePill bp={live?.change?.bp} locale={locale} size="sm" />
          <span className="text-xs text-text-3 tabular-nums">{live ? formatTime(live.observedAt, locale) : ""}</span>
        </div>
      </div>
    </Link>
  );
}
