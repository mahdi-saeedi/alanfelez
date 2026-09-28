import { formatBp, type Locale } from "@alanfelez/ui/format";

/** Daily change as a colored pill with an arrow (green up, red down, gray unchanged). */
export function ChangePill({ bp, locale, size = "md" }: { bp?: number; locale: Locale; size?: "sm" | "md" }) {
  if (bp === undefined) return <span className="text-text-3">—</span>;
  const tone = bp > 0 ? "bg-up-bg text-up" : bp < 0 ? "bg-down-bg text-down" : "bg-surface-2 text-text-2";
  const arrow = bp > 0 ? "↑" : bp < 0 ? "↓" : "";
  const pad = size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-bold tabular-nums ${tone} ${pad}`} dir="ltr">
      {formatBp(bp, locale)}
      {arrow && <span aria-hidden>{arrow}</span>}
    </span>
  );
}
