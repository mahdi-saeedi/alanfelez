"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { AreaChart, type ChartPoint } from "./AreaChart";
import { MetalIcon } from "./MetalIcon";

export type GlobalChartItem = {
  slug: string;
  metal: string; // metal slug, for the chart page link
  name: string; // metal name
  price: string; // formatted, with its unit label next to it
  unit: string;
  change?: string; // formatted 1-month change
  up: boolean;
  source: string;
  updated: string; // formatted "last updated"
  points: ChartPoint[];
};

/** A full chart takes longer to read than the hero sparkline, so each metal stays 8 s. */
const ROTATE_MS = 8000;

/**
 * Home page: the global prices' 1-month charts with time and price axes, one metal after another (client,
 * 2026-10-26). Pauses while the pointer or focus is on it (the crosshair is in use), never rotates with reduced
 * motion, and the tabs pick a metal by hand. Source and last update always show next to the price.
 */
export function GlobalChartCarousel({ items, locale, labels }: { items: GlobalChartItem[]; locale: Locale; labels: { change: string; source: string; full: string } }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || items.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % items.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, items.length]);
  const cur = items[i % items.length];
  if (!cur) return null;

  return (
    <div
      className="rounded-card border border-border bg-surface shadow-soft"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Tabs with a line between metals; the metal on show is larger, bold, on a gold tint and underlined in gold
          (client, 2026-11-02: the change from one metal to the next must be plain to see). */}
      <div role="tablist" className="flex overflow-x-auto border-b border-border px-3 pt-3 [scrollbar-width:none]">
        {items.map((it, k) => {
          const on = k === i % items.length;
          return (
            <button
              key={it.slug}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setI(k)}
              className={`shrink-0 cursor-pointer border-s border-border px-4 py-2.5 transition-colors first:border-s-0 ${on ? "rounded-t-lg bg-gold/10 text-base font-extrabold text-text shadow-[inset_0_-3px_0_var(--color-gold)]" : "text-sm text-text-2 hover:text-text"}`}
            >
              {it.name}
            </button>
          );
        })}
      </div>
      <div className="p-5" role="tabpanel" aria-live="polite">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div key={cur.slug} className="flex items-center gap-3 text-xl font-extrabold tabular-nums motion-safe:animate-fade-in">
            <MetalIcon slug={cur.metal} className="h-10 w-10" />
            {cur.name} <span className="mx-1 text-text-3">—</span> {cur.price}
            <span className="ms-2 text-xs font-normal text-text-3" dir="ltr">{cur.unit}</span>
          </div>
          <div className="text-sm text-text-2">
            {labels.change} {cur.change && <span className={`font-bold ${cur.up ? "text-up" : "text-down"}`} dir="ltr">{cur.change}</span>}
          </div>
        </div>
        <AreaChart key={cur.slug} points={cur.points} locale={locale} intraday={false} format="usd" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-3">
          <span>{labels.source.replace("{source}", cur.source).replace("{time}", cur.updated)}</span>
          <Link href={{ pathname: "/chart", query: { metal: cur.metal, cat: "global", series: cur.slug } }} className="font-bold text-gold-dark hover:text-gold">
            {labels.full}
          </Link>
        </div>
      </div>
    </div>
  );
}
