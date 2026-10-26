"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDate, formatTime, type Locale } from "@alanfelez/ui/format";

export type ChartPoint = { t: string; v: number };

/** Width before the container is measured (server render): the desktop layout. */
const DEFAULT_W = 800;
const NARROW = 520; // below this width (phones): compact axis labels, a taller chart

/**
 * Area chart of one series (design 08-price-chart): gradient fill, line drawing in, round-number gridlines, the
 * latest price marked at the end of the line, and a crosshair with the value under the pointer or finger. Time always
 * runs left → right (dir=ltr), as on every price chart. `format` renders a value for labels (already in display units).
 *
 * Drawn at the container's real pixel size (not a scaled-down picture), so the labels stay readable on phones; a
 * vertical swipe still scrolls the page (touch-action: pan-y).
 */
export function AreaChart({ points, locale, intraday, format }: { points: ChartPoint[]; locale: Locale; intraday: boolean; format: "int" | "usd" }) {
  const id = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(DEFAULT_W);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = w < NARROW;
  const H = narrow ? Math.round(w * 0.72) : Math.round(Math.min(340, Math.max(260, w * 0.36)));
  const PAD = { top: 18, right: narrow ? 10 : 16, bottom: 28, left: narrow ? 46 : 70 };
  const lang = locale === "fa" ? "fa-IR" : "en-US";
  const fmt = useMemo(() => {
    const full = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
    const compact = new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 });
    const cur = (t: string) => (format === "usd" ? "$" : "") + t;
    return {
      full: (v: number) => cur(full.format(v)),
      // Phones: the unit is written above the chart, so the axis shows short numbers; big ones compact («۶۴۰ هزار»),
      // isolated right-to-left so the Persian word stays after the number inside this left-to-right chart.
      axis: (v: number) => (!narrow ? cur(full.format(v)) : Math.abs(v) < 100_000 ? full.format(v) : `\u2067${compact.format(v)}\u2069`),
    };
  }, [lang, format, narrow]);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vs = points.map((p) => p.v);
    const ticks = niceTicks(Math.min(...vs), Math.max(...vs), narrow ? 4 : 5);
    const lo = ticks[0]!;
    const hi = ticks[ticks.length - 1]!;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const t0 = Date.parse(first.t);
    const t1 = Date.parse(last.t);
    const x = (t: string) => PAD.left + ((Date.parse(t) - t0) / (t1 - t0 || 1)) * (w - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(last.t).toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z`;
    return { x, y, line, area, ticks, last, up: last.v >= first.v };
  }, [points, w, H, narrow, PAD.left, PAD.right, PAD.top, PAD.bottom]);

  if (!geo) return null;
  const tone = geo.up ? "up" : "down";
  const label = (t: string) => (intraday ? formatTime(t, locale) : formatDate(t, locale));
  const xLabels = narrow ? [0, points.length - 1] : [0, Math.floor(points.length / 2), points.length - 1];

  function pick(clientX: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r || !geo) return;
    const px = clientX - r.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(geo.x(points[i]!.t) - px) < Math.abs(geo.x(points[best]!.t) - px)) best = i;
    }
    setHover(best);
  }

  const h = hover !== null ? (points[hover] ?? null) : null;
  const lastY = geo.y(geo.last.v);
  // Keep the tooltip inside the chart near the edges.
  const tipX = h ? Math.min(Math.max(geo.x(h.t), 70), w - 70) : 0;
  return (
    <div ref={box} className="relative" dir="ltr">
      <svg
        viewBox={`0 0 ${w} ${H}`}
        className="block h-auto w-full touch-pan-y select-none"
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        role="img"
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className={geo.up ? "[stop-color:var(--color-up)]" : "[stop-color:var(--color-down)]"} stopOpacity="0.2" />
            <stop offset="100%" className={geo.up ? "[stop-color:var(--color-up)]" : "[stop-color:var(--color-down)]"} stopOpacity="0" />
          </linearGradient>
        </defs>
        {geo.ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={w - PAD.right} y1={geo.y(v)} y2={geo.y(v)} className="stroke-border" strokeDasharray="3 4" />
            <text x={PAD.left - 8} y={geo.y(v) + 4} textAnchor="end" className="fill-text-3 text-[11px] tabular-nums sm:text-xs">
              {fmt.axis(v)}
            </text>
          </g>
        ))}
        {xLabels.map((i, k) => (
          <text key={k} x={geo.x(points[i]!.t)} y={H - 8} textAnchor={k === 0 ? "start" : k === xLabels.length - 1 ? "end" : "middle"} className="fill-text-3 text-[11px] sm:text-xs">
            {label(points[i]!.t)}
          </text>
        ))}
        <path d={geo.area} fill={`url(#g${id})`} />
        <path
          d={geo.line}
          pathLength={2000}
          strokeDasharray="2000"
          className={`fill-none animate-draw ${tone === "up" ? "stroke-up" : "stroke-down"}`}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* The latest price: a dot at the end of the line and a dashed level across. */}
        <line x1={PAD.left} x2={w - PAD.right} y1={lastY} y2={lastY} className={tone === "up" ? "stroke-up" : "stroke-down"} strokeOpacity="0.35" strokeDasharray="2 4" />
        <circle cx={geo.x(geo.last.t)} cy={lastY} r="4" className={tone === "up" ? "fill-up" : "fill-down"} stroke="white" strokeWidth="2" />
        {h && (
          <g>
            <line x1={geo.x(h.t)} x2={geo.x(h.t)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-border-strong" />
            <circle cx={geo.x(h.t)} cy={geo.y(h.v)} r="5" className={tone === "up" ? "fill-up" : "fill-down"} stroke="white" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-1 whitespace-nowrap rounded-lg bg-graphite px-3 py-1.5 text-xs text-white shadow-card"
          style={{ left: tipX, transform: "translateX(-50%)" }}
        >
          <div className="font-bold tabular-nums">{fmt.full(h.v)}</div>
          <div className="text-silver-light">{formatDate(h.t, locale, intraday)}</div>
        </div>
      )}
    </div>
  );
}

/** About `count` round gridline values (steps of 1, 2, 2.5 or 5 × 10ⁿ) covering min…max, with a little room. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const d = Math.abs(min) * 0.05 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
