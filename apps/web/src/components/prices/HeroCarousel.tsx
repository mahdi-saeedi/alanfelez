"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Sparkline } from "./Sparkline";

export type HeroItem = {
  slug: string;
  name: string; // metal name
  price: string; // formatted
  unit: string; // e.g. "$/ton"
  change?: string; // formatted 30-day change
  up: boolean;
  dayChange?: string; // formatted daily change, for the small list
  dayUp: boolean;
  points: number[];
};

/** Rotate every few seconds: long enough to read a price and its trend, short enough to see all four quickly. */
const ROTATE_MS = 6000;

/**
 * Home hero card: the global prices' 1-month charts (all 7 metals once they have prices), one after another (client, 2026-10-25). Pauses while hovered or
 * focused, never rotates for people who prefer reduced motion, and the dots pick a chart by hand.
 */
export function HeroCarousel({ items, changeLabel, showLabel }: { items: HeroItem[]; changeLabel: string; showLabel: string }) {
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
      className="rounded-card border border-graphite-3 bg-graphite-2/60 p-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Link href={{ pathname: "/chart", query: { series: cur.slug } }} className="block rounded-lg hover:text-gold focus-visible:outline-2 focus-visible:outline-gold" aria-live="polite">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-bold">
            {cur.name} — {cur.price} <span className="text-sm font-normal text-silver-light" dir="ltr">{cur.unit}</span>
          </span>
          <span className="text-xs text-silver-light">
            {changeLabel} {cur.change && <span className={cur.up ? "text-up" : "text-down"} dir="ltr">{cur.change}</span>}
          </span>
        </div>
        <Sparkline key={cur.slug} values={cur.points} className="mt-4 h-32 w-full motion-safe:animate-fade-in" />
      </Link>
      <ul className="mt-4 grid grid-cols-4 gap-2 text-center text-xs sm:grid-cols-7">
        {items.map((it, k) => (
          <li key={it.slug}>
            <button
              type="button"
              onClick={() => setI(k)}
              aria-label={`${showLabel} ${it.name}`}
              aria-pressed={k === i % items.length}
              className={`w-full cursor-pointer rounded-md px-1 py-1 ${k === i % items.length ? "bg-graphite-3/70" : "hover:bg-graphite-3/40"}`}
            >
              <div className={k === i % items.length ? "font-bold text-white" : "text-silver-light"}>{it.name}</div>
              <div className={it.dayUp ? "text-up" : "text-down"} dir="ltr">{it.dayChange ?? "—"}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
