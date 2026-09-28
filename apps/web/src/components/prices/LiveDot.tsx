"use client";

import { useTranslations } from "next-intl";
import { useLiveConnected } from "./LivePrices";

/** Pulsing dot: green while the live stream is connected. */
export function LiveDot({ withLabel = false }: { withLabel?: boolean }) {
  const t = useTranslations("prices");
  const on = useLiveConnected();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${on ? "animate-pulse bg-up" : "bg-silver-light"}`} aria-hidden />
      {withLabel && <span className={on ? "text-up" : "text-text-3"}>{on ? t("live") : t("reconnecting")}</span>}
    </span>
  );
}
