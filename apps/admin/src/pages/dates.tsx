import { useTranslate } from "@refinedev/core";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { JALALI_MONTHS, jalaliInTehran, jalaliMonthDays, jalaliToGregorian } from "@alanfelez/ui/jalali";
import { api } from "../api";
import { Button, Input, Select } from "./ui";

/**
 * Days for the dashboard and the activity pages. A day is a Tehran calendar date as "YYYY-MM-DD" (what the API takes).
 * In Persian staff pick a Jalali day, month and year; in English a plain date field.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Today in Tehran, "YYYY-MM-DD". */
export function todayTehran(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}

/** A day plus n days (n may be negative). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A day as an ISO moment at Tehran noon, for formatDate. */
export const noonOf = (day: string) => `${day}T12:00:00+03:30`;

const FIRST_YEAR = 1404; // the site's activity starts in 1405; one year before for the visitor totals

/** One day. `max` (default today) is the latest day that can be picked. */
export function DayPicker({ value, onChange, locale, label, max = todayTehran() }: {
  value: string; onChange: (day: string) => void; locale: Locale; label: string; max?: string;
}) {
  const t = useTranslate();
  if (locale !== "fa") {
    return <Input type="date" value={value} max={max} aria-label={label} onChange={(e) => e.target.value && onChange(e.target.value)} className="w-40" />;
  }
  const cur = jalaliInTehran(new Date(noonOf(value)));
  const top = jalaliInTehran(new Date(noonOf(max)));
  const set = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch };
    next.day = Math.min(next.day, jalaliMonthDays(next.year, next.month));
    const g = jalaliToGregorian(next.year, next.month, next.day);
    const day = `${g.year}-${pad(g.month)}-${pad(g.day)}`;
    onChange(day > max ? max : day);
  };
  const fa = (n: number) => formatNumber(n, "fa").replace(/٬/g, "");
  const years = Array.from({ length: Math.max(1, top.year - FIRST_YEAR + 1) }, (_, i) => top.year - i);
  const days = Array.from({ length: jalaliMonthDays(cur.year, cur.month) }, (_, i) => i + 1);
  return (
    <span className="inline-flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <Select value={cur.day} onChange={(e) => set({ day: Number(e.target.value) })} aria-label={t("prices.day")}>
        {days.map((d) => <option key={d} value={d}>{fa(d)}</option>)}
      </Select>
      <Select value={cur.month} onChange={(e) => set({ month: Number(e.target.value) })} aria-label={t("prices.month")}>
        {JALALI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select>
      <Select value={cur.year} onChange={(e) => set({ year: Number(e.target.value) })} aria-label={t("prices.year")}>
        {years.map((y) => <option key={y} value={y}>{fa(y)}</option>)}
      </Select>
    </span>
  );
}

export type Range = { from: string; to: string };

/** The last n days up to today. */
export const lastDays = (n: number): Range => ({ from: addDays(todayTehran(), -(n - 1)), to: todayTehran() });

/** A from–to range with quick choices (today, 7, 30, 90 days, all the history kept: 2 years). */
export function RangePicker({ value, onChange, locale }: { value: Range; onChange: (r: Range) => void; locale: Locale }) {
  const t = useTranslate();
  const quick: [string, Range][] = [
    ["range.today", lastDays(1)], ["range.d7", lastDays(7)], ["range.d30", lastDays(30)], ["range.d90", lastDays(90)], ["range.all", lastDays(730)],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/60 bg-gold/5 px-2.5 py-2">
      <span className="text-sm font-bold">{t("range.from")}</span>
      <DayPicker value={value.from} max={value.to} locale={locale} label={t("range.from")} onChange={(from) => onChange({ ...value, from })} />
      <span className="text-sm font-bold">{t("range.to")}</span>
      <DayPicker value={value.to} locale={locale} label={t("range.to")} onChange={(to) => onChange({ from: value.from > to ? to : value.from, to })} />
      <span className="flex flex-wrap gap-1">
        {quick.map(([k, r]) => (
          <Button key={k} type="button" tone={r.from === value.from && r.to === value.to ? "gold" : "ghost"} onClick={() => onChange(r)}>{t(k)}</Button>
        ))}
      </span>
    </div>
  );
}

/** Seconds as "۲ ساعت و ۵ دقیقه" / "2 h 5 min" (under a minute: "کمتر از ۱ دقیقه"). */
export function duration(seconds: number, locale: Locale, t: (k: string, o?: Record<string, unknown>) => string): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return seconds > 0 ? t("time.underMinute") : t("time.minutes", { n: formatNumber(0, locale) });
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return t("time.minutes", { n: formatNumber(rest, locale) });
  if (!rest) return t("time.hours", { n: formatNumber(h, locale) });
  return t("time.hoursMinutes", { h: formatNumber(h, locale), m: formatNumber(rest, locale) });
}

/** Downloads a CSV export (fetched with the staff token, so it can't be a plain link). */
export async function downloadCsv(path: "/v1/admin/users/export" | "/v1/admin/activity/export" | "/v1/admin/analytics/export", query: Record<string, string | undefined>, fallbackName: string) {
  const clean = Object.fromEntries(Object.entries(query).filter(([, v]) => v));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the two exports take different query types
  const res = await api.GET(path, { params: { query: clean as any }, parseAs: "blob" });
  if (!res.data) throw Object.assign(new Error(res.response.statusText), { problem: res.error, status: res.response.status });
  const name = /filename="([^"]+)"/.exec(res.response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(res.data as Blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** The metals' colours (as on the website's hero chart), for the activity bars and chips. */
export const METAL_COLOR: Record<string, string> = {
  aluminum: "#8fa3b8", copper: "#c46a3a", zinc: "#5f8fb3", lead: "#5b6573", brass: "#c9a227", "cast-iron": "#45494f", iron: "#a0533b",
};
export const metalColor = (slug: string) => METAL_COLOR[slug] ?? "#9ca3af";

/** The metals in the client's order (migration 00026), for filters. */
export const METALS = ["aluminum", "copper", "zinc", "lead", "brass", "cast-iron", "iron"];
export const ACTIVITIES = ["trader", "producer", "industrial-consumer", "recycler", "investor", "other"];
export const SECTIONS = ["home", "prices", "chart", "auctions", "analysis", "articles", "calculator", "plans", "checkout", "account", "faq", "about", "contact", "search", "other"];

/** A horizontal bar row: label, bar (share of max), value. */
export function Bar({ label, value, max, color, text }: { label: string; value: number; max: number; color: string; text: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-xs">
      <span className="truncate">{label}</span>
      <span className="h-3 rounded-full bg-surface-2">
        <span className="block h-3 rounded-full" style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%`, background: color }} />
      </span>
      <b className="tabular-nums text-text-2">{text}</b>
    </div>
  );
}
