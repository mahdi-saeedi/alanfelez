import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";

/** Stacked daily bars (one stack per day), drawn inline: the dashboard trend and the revenue report. */
export function DayBars({ days, series, locale, height = 140, format }: {
  days: string[];
  series: { label: string; color: string; values: number[] }[];
  locale: Locale;
  height?: number;
  format?: (v: number) => string;
}) {
  const totals = days.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const fmt = format ?? ((v: number) => formatNumber(v, locale));
  const w = 100 / Math.max(1, days.length);
  return (
    <div className="space-y-2">
      <div className="relative flex items-end gap-px" style={{ height }} dir="ltr">
        {days.map((d, i) => (
          <div key={d} className="group relative flex h-full flex-1 flex-col justify-end" style={{ maxWidth: `${w}%` }}>
            {series.map((s) => {
              const v = s.values[i] ?? 0;
              return v > 0 ? <div key={s.label} style={{ height: `${(v / max) * 100}%`, background: s.color }} className="w-full first:rounded-t-sm" /> : null;
            })}
            <div className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-graphite px-2 py-1 text-[10px] text-white group-hover:block" dir="rtl">
              {formatDate(`${d}T12:00:00+03:30`, locale)}: {fmt(totals[i] ?? 0)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-text-3" dir="ltr">
        <span>{days.length ? formatDate(`${days[0]}T12:00:00+03:30`, locale) : ""}</span>
        <span>{days.length ? formatDate(`${days[days.length - 1]}T12:00:00+03:30`, locale) : ""}</span>
      </div>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {series.map((s) => <span key={s.label}><i className="me-1 inline-block h-2 w-3 rounded" style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
    </div>
  );
}
