"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatDate, formatTime, type Locale } from "@alanfelez/ui/format";

export type ChartPoint = { t: string; v: number };

const W = 800;
const H = 280;
const PAD = { top: 16, right: 12, bottom: 28, left: 64 };

/**
 * Area chart of one series (design 08-price-chart): gradient fill, line drawing in, gridlines, and a crosshair
 * with the value under the pointer. Time always runs left → right (dir=ltr), as on every price chart.
 * `format` renders a value for labels (already in display units).
 */
export function AreaChart({ points, locale, intraday, format }: { points: ChartPoint[]; locale: Locale; intraday: boolean; format: "int" | "usd" }) {
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const nf = useMemo(() => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 0 }), [locale]);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vs = points.map((p) => p.v);
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const pad = (max - min || max * 0.01 || 1) * 0.08;
    const lo = min - pad;
    const hi = max + pad;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const t0 = Date.parse(first.t);
    const t1 = Date.parse(last.t);
    const x = (t: string) => PAD.left + ((Date.parse(t) - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(last.t).toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z`;
    const grid = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
    return { x, y, line, area, grid, up: last.v >= first.v };
  }, [points]);

  if (!geo) return null;
  const tone = geo.up ? "up" : "down";
  const label = (t: string) => (intraday ? formatTime(t, locale) : formatDate(t, locale));
  const xLabels = [0, Math.floor(points.length / 2), points.length - 1];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !geo) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(geo.x(points[i]!.t) - px) < Math.abs(geo.x(points[best]!.t) - px)) best = i;
    }
    setHover(best);
  }

  const h = hover !== null ? (points[hover] ?? null) : null;
  return (
    <div className="relative" dir="ltr">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className={geo.up ? "[stop-color:var(--color-up)]" : "[stop-color:var(--color-down)]"} stopOpacity="0.22" />
            <stop offset="100%" className={geo.up ? "[stop-color:var(--color-up)]" : "[stop-color:var(--color-down)]"} stopOpacity="0" />
          </linearGradient>
        </defs>
        {geo.grid.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(v)} y2={geo.y(v)} className="stroke-border" strokeDasharray="3 4" />
            <text x={PAD.left - 8} y={geo.y(v) + 4} textAnchor="end" className="fill-text-3 text-[11px] tabular-nums">
              {format === "usd" ? `$${nf.format(v)}` : nf.format(v)}
            </text>
          </g>
        ))}
        {xLabels.map((i, k) => (
          <text key={k} x={geo.x(points[i]!.t)} y={H - 8} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} className="fill-text-3 text-[11px]">
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
        />
        {h && (
          <g>
            <line x1={geo.x(h.t)} x2={geo.x(h.t)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-border-strong" />
            <circle cx={geo.x(h.t)} cy={geo.y(h.v)} r="4.5" className={tone === "up" ? "fill-up" : "fill-down"} stroke="white" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg bg-graphite px-3 py-1.5 text-xs text-white shadow-card"
          style={{ left: `${(geo.x(h.t) / W) * 100}%`, transform: "translateX(-50%)" }}
        >
          <div className="font-bold tabular-nums">{format === "usd" ? `$${nf.format(h.v)}` : nf.format(h.v)}</div>
          <div className="text-silver-light">{formatDate(h.t, locale, intraday)}</div>
        </div>
      )}
    </div>
  );
}
