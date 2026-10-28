"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatBp, formatDate, formatTime, type Locale } from "@alanfelez/ui/format";
import { niceTicks, type ChartPoint } from "./AreaChart";

/** One line of the comparison: its name, color and points (values in any unit; only the % change is drawn). */
export type CompareLine = { key: string; name: string; color: string; points: ChartPoint[] };

const DEFAULT_W = 800;
const NARROW = 520;

/**
 * Comparison chart (client, 2026-10-28): up to four series on one chart as the % change from the start of the range,
 * so a $9,800 copper and a $2,900 zinc read side by side; a higher line rose more. Same look and behaviour as
 * AreaChart: real pixel size, time left → right, a crosshair with every series' change and price under the pointer.
 */
export function CompareChart({ lines, locale, intraday }: { lines: CompareLine[]; locale: Locale; intraday: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(DEFAULT_W);
  const [hoverT, setHoverT] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = w < NARROW;
  const H = narrow ? Math.round(w * 0.8) : Math.round(Math.min(360, Math.max(280, w * 0.38)));
  const PAD = { top: 18, right: narrow ? 10 : 16, bottom: 28, left: narrow ? 44 : 56 };

  // Each line as % change (in basis points) from its first point.
  const pct = useMemo(
    () =>
      lines
        .filter((l) => l.points.length > 1 && l.points[0]!.v !== 0)
        .map((l) => ({ ...l, bps: l.points.map((p) => ({ t: Date.parse(p.t), bp: ((p.v - l.points[0]!.v) / l.points[0]!.v) * 10_000, v: p.v })) })),
    [lines],
  );

  const geo = useMemo(() => {
    if (pct.length === 0) return null;
    const all = pct.flatMap((l) => l.bps);
    const t0 = Math.min(...all.map((p) => p.t));
    const t1 = Math.max(...all.map((p) => p.t));
    const ticks = niceTicks(Math.min(0, ...all.map((p) => p.bp)), Math.max(0, ...all.map((p) => p.bp)), narrow ? 4 : 6);
    const lo = ticks[0]!;
    const hi = ticks[ticks.length - 1]!;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * (w - PAD.left - PAD.right);
    const y = (bp: number) => PAD.top + (1 - (bp - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
    const paths = pct.map((l) => ({ ...l, d: l.bps.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.bp).toFixed(1)}`).join(" ") }));
    return { x, y, ticks, t0, t1, paths };
  }, [pct, w, H, narrow, PAD.left, PAD.right, PAD.top, PAD.bottom]);

  if (!geo) return null;
  const label = (t: number) => (intraday ? formatTime(new Date(t).toISOString(), locale) : formatDate(new Date(t).toISOString(), locale));
  const nf = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 0 });
  const axis = (bp: number) => `${bp > 0 ? "+" : ""}${nf.format(bp / 100)}%`;

  function pick(clientX: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r || !geo) return;
    const t = geo.t0 + ((clientX - r.left - PAD.left) / (w - PAD.left - PAD.right)) * (geo.t1 - geo.t0);
    setHoverT(Math.min(geo.t1, Math.max(geo.t0, t)));
  }
  // At the pointer: each line's nearest point.
  const at = hoverT === null ? null : geo.paths.map((l) => ({ l, p: l.bps.reduce((a, b) => (Math.abs(b.t - hoverT) < Math.abs(a.t - hoverT) ? b : a)) }));
  const hx = hoverT === null ? 0 : geo.x(hoverT);
  const tipLeft = hx < w / 2;

  return (
    <div ref={box} className="relative" dir="ltr">
      <svg
        viewBox={`0 0 ${w} ${H}`}
        className="block h-auto w-full touch-pan-y select-none"
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHoverT(null)}
        role="img"
      >
        {geo.ticks.map((bp) => (
          <g key={bp}>
            <line x1={PAD.left} x2={w - PAD.right} y1={geo.y(bp)} y2={geo.y(bp)} className={bp === 0 ? "stroke-border-strong" : "stroke-border"} strokeDasharray={bp === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 8} y={geo.y(bp) + 4} textAnchor="end" className="fill-text-3 text-[11px] tabular-nums sm:text-xs">{axis(bp)}</text>
          </g>
        ))}
        {(narrow ? [geo.t0, geo.t1] : [geo.t0, (geo.t0 + geo.t1) / 2, geo.t1]).map((t, k, arr) => (
          <text key={k} x={geo.x(t)} y={H - 8} textAnchor={k === 0 ? "start" : k === arr.length - 1 ? "end" : "middle"} className="fill-text-3 text-[11px] sm:text-xs">
            {label(t)}
          </text>
        ))}
        {geo.paths.map((l) => {
          const last = l.bps[l.bps.length - 1]!;
          return (
            <g key={l.key}>
              <path d={l.d} pathLength={2000} strokeDasharray="2000" className="animate-draw fill-none" stroke={l.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={geo.x(last.t)} cy={geo.y(last.bp)} r="4" fill={l.color} stroke="white" strokeWidth="2" />
            </g>
          );
        })}
        {at && (
          <g>
            <line x1={hx} x2={hx} y1={PAD.top} y2={H - PAD.bottom} className="stroke-border-strong" />
            {at.map(({ l, p }) => <circle key={l.key} cx={geo.x(p.t)} cy={geo.y(p.bp)} r="4.5" fill={l.color} stroke="white" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {at && (
        <div
          className="pointer-events-none absolute top-1 min-w-40 rounded-lg bg-graphite px-3 py-2 text-xs text-white shadow-card"
          style={tipLeft ? { left: hx + 12 } : { right: w - hx + 12 }}
          dir={locale === "fa" ? "rtl" : "ltr"}
        >
          <div className="mb-1 text-silver-light">{formatDate(new Date(hoverT!).toISOString(), locale, intraday)}</div>
          {at.map(({ l, p }) => (
            <div key={l.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />{l.name}</span>
              <b className="tabular-nums" dir="ltr">{formatBp(Math.round(p.bp), locale)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
