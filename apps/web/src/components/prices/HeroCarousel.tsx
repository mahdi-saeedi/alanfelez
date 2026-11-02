"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { MetalIcon } from "./MetalIcon";
import { LOOKS, NEUTRAL } from "./metal-colors";

export type HeroItem = {
  metal: string; // metal slug: its colours
  name: string; // metal name
  /** Absent while the metal has no world price yet: its tab says «به‌زودی» and the rotation skips it. */
  chart?: {
    slug: string; // series, for the chart page link
    price: string; // formatted
    unit: string; // e.g. "$/ton"
    change?: string; // formatted 30-day change
    up: boolean;
    dayChange?: string; // formatted daily change, for the tabs
    dayUp: boolean;
    points: number[];
  };
};

/** Rotate every few seconds: long enough to read a price and its trend, short enough to see all metals quickly. */
const ROTATE_MS = 6000;

/**
 * Home hero card next to the tagline (client, 2026-10-25; 2026-11-02): the world prices' 1-month charts, one metal after
 * another, with all seven metals in the tabs. Each metal brings its own colour (glow, ingot, line, progress bar) and
 * slides in, so the change is plain to see; the bar under the chart shows the time until the next one. Pauses while
 * hovered or focused, never moves for people who prefer reduced motion, and the tabs pick a metal by hand.
 */
export function HeroCarousel({ items, changeLabel, showLabel, soonLabel }: { items: HeroItem[]; changeLabel: string; showLabel: string; soonLabel: string }) {
  const ready = items.filter((it) => it.chart);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (paused || still || ready.length < 2) return;
    const id = setTimeout(() => setI((n) => (n + 1) % ready.length), ROTATE_MS);
    return () => clearTimeout(id);
  }, [paused, still, ready.length, i]);
  const cur = ready[i % ready.length];
  if (!cur?.chart) return null;
  const c = cur.chart;
  const look = LOOKS[cur.metal] ?? NEUTRAL;

  return (
    <div
      className="relative overflow-hidden rounded-card border border-graphite-3 bg-graphite-2/60 p-6 transition-colors duration-700"
      style={{ boxShadow: `inset 0 0 0 1px ${look.line}22` }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* The metal's glow behind the card; it changes colour with the metal. */}
      <span aria-hidden className="pointer-events-none absolute -end-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl transition-colors duration-700" style={{ backgroundColor: look.front }} />
      <Link
        key={cur.metal}
        href={{ pathname: "/chart", query: { series: c.slug } }}
        className="relative block rounded-lg hover:text-gold focus-visible:outline-2 focus-visible:outline-gold motion-safe:animate-slide-in"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <MetalIcon slug={cur.metal} className="h-12 w-12" />
          <div className="min-w-0">
            <div className="text-2xl font-extrabold">{cur.name}</div>
            <div className="text-xs text-silver-light" dir="ltr">{c.unit}</div>
          </div>
          <div className="ms-auto text-end">
            <div className="text-2xl font-extrabold tabular-nums">{c.price}</div>
            <div className="text-xs text-silver-light">
              {changeLabel} {c.change && <span className={c.up ? "text-up" : "text-down"} dir="ltr">{c.change}</span>}
            </div>
          </div>
        </div>
        <HeroLine values={c.points} color={look.line} />
      </Link>
      {/* Time until the next metal, in the metal's colour; restarts with each metal. */}
      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
        {!paused && !still && ready.length > 1 && (
          <span key={`${cur.metal}-${i}`} className="absolute inset-0 origin-left rounded-full animate-progress rtl:origin-right" style={{ backgroundColor: look.line, animationDuration: `${ROTATE_MS}ms` }} />
        )}
      </div>
      <ul className="relative mt-4 grid grid-cols-4 gap-1.5 text-center text-xs sm:grid-cols-7">
        {items.map((it) => {
          const k = ready.indexOf(it);
          const on = it === cur;
          const l = LOOKS[it.metal] ?? NEUTRAL;
          return (
            <li key={it.metal}>
              <button
                type="button"
                disabled={!it.chart}
                onClick={() => setI(k)}
                aria-label={`${showLabel} ${it.name}`}
                aria-pressed={on}
                className={`w-full rounded-md px-1 py-1.5 transition-colors duration-500 ${on ? "" : it.chart ? "cursor-pointer hover:bg-graphite-3/40" : "cursor-default opacity-60"}`}
                style={on ? { backgroundColor: `${l.front}55`, boxShadow: `inset 0 -2px 0 ${l.line}` } : undefined}
              >
                <div className={on ? "font-bold text-white" : "text-silver-light"}>{it.name}</div>
                {it.chart ? (
                  <div className={it.chart.dayUp ? "text-up" : "text-down"} dir="ltr">{it.chart.dayChange ?? "—"}</div>
                ) : (
                  <div className="text-[10px] text-silver">{soonLabel}</div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The 1-month line in the metal's colour, with a soft area under it; drawn in again for each metal. */
function HeroLine({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="mt-4 h-32" />;
  const w = 300;
  const h = 110;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, k) => `${((k / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 12)).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-4 h-32 w-full" aria-hidden>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity="0.14" className="motion-safe:animate-fade-in" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" pathLength={2000} strokeDasharray="2000" className="motion-safe:animate-draw" />
    </svg>
  );
}
