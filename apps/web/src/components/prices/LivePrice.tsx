"use client";

import { useLocale } from "next-intl";
import { formatDate, formatPriceValue, type Locale, type PriceDisplay } from "@alanfelez/ui/format";
import { useLive } from "./LivePrices";

/** The live price of one series in the chosen display unit. */
export function LivePrice({ slug, display, fallback }: { slug: string; display: PriceDisplay; fallback: string }) {
  const locale = useLocale() as Locale;
  const live = useLive(slug);
  if (!live) return <>{fallback}</>;
  return <span key={live.tick} className={live.flash === "up" ? "animate-flash-up rounded" : live.flash === "down" ? "animate-flash-down rounded" : ""}>{formatPriceValue(live.price, locale, display)}</span>;
}

/** Time of the live price, as a full date + time. */
export function LiveUpdated({ slug, fallback }: { slug: string; fallback?: string }) {
  const locale = useLocale() as Locale;
  const live = useLive(slug);
  const at = live?.observedAt ?? fallback;
  return <>{at ? formatDate(at, locale, true) : "—"}</>;
}
