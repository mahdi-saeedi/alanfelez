/** Tiny trend line for compare cards (no axes). values are in time order. */
export function Sparkline({ values, className = "h-12 w-full", tone }: { values: number[]; className?: string; tone?: "up" | "down" | "flat" }) {
  if (values.length < 2) return <div className={className} />;
  const w = 120;
  const h = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
  const t = tone ?? (values[values.length - 1]! >= values[0]! ? "up" : "down");
  const stroke = t === "up" ? "stroke-up" : t === "down" ? "stroke-down" : "stroke-silver";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <path d={d} className={`fill-none ${stroke}`} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
