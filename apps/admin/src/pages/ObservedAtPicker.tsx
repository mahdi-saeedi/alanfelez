import { useTranslate } from "@refinedev/core";
import type { Locale } from "@alanfelez/ui/format";
import { JALALI_MONTHS, jalaliInTehran, jalaliMonthDays, tehranToUTC } from "@alanfelez/ui/jalali";
import { Button, Input, Select } from "./ui";

const FIRST_YEAR = 1390; // how far back the year list goes

/**
 * When a price was quoted. `value` is "" (now) or a UTC ISO string. In Persian staff pick a Jalali day and a Tehran
 * time; in English a plain date-time field (the browser's time zone). Picking a past day back-dates the entry: it goes
 * into history and the charts but never replaces the latest price on the site.
 */
export function ObservedAtPicker({ value, onChange, locale }: { value: string; onChange: (iso: string) => void; locale: Locale }) {
  const t = useTranslate();
  if (!value) {
    return (
      <span className="flex items-center gap-2 text-sm">
        {t("prices.now")}
        <Button type="button" tone="ghost" onClick={() => onChange(tehranNowISO())}>{t("prices.pickDate")}</Button>
      </span>
    );
  }
  const reset = <Button type="button" tone="ghost" onClick={() => onChange("")}>{t("prices.backToNow")}</Button>;
  if (locale !== "fa") {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Input type="datetime-local" value={toLocalInput(value)} max={toLocalInput(new Date().toISOString())}
          onChange={(e) => e.target.value && onChange(new Date(e.target.value).toISOString())} aria-label={t("prices.observedAt")} className="w-48" />
        {reset}
      </span>
    );
  }

  const cur = jalaliInTehran(new Date(value));
  const today = jalaliInTehran();
  const set = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch };
    next.day = Math.min(next.day, jalaliMonthDays(next.year, next.month));
    onChange(tehranToUTC(next, next.hour, next.minute));
  };
  const fa = (n: number) => n.toLocaleString("fa-IR", { useGrouping: false });
  const years = Array.from({ length: today.year - FIRST_YEAR + 1 }, (_, i) => today.year - i);
  const days = Array.from({ length: jalaliMonthDays(cur.year, cur.month) }, (_, i) => i + 1);
  const hhmm = `${String(cur.hour).padStart(2, "0")}:${String(cur.minute).padStart(2, "0")}`;
  return (
    <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("prices.observedAt")}>
      <Select value={cur.day} onChange={(e) => set({ day: Number(e.target.value) })} aria-label={t("prices.day")}>
        {days.map((d) => <option key={d} value={d}>{fa(d)}</option>)}
      </Select>
      <Select value={cur.month} onChange={(e) => set({ month: Number(e.target.value) })} aria-label={t("prices.month")}>
        {JALALI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select>
      <Select value={cur.year} onChange={(e) => set({ year: Number(e.target.value) })} aria-label={t("prices.year")}>
        {years.map((y) => <option key={y} value={y}>{fa(y)}</option>)}
      </Select>
      <Input type="time" dir="ltr" value={hhmm} aria-label={t("prices.time")} className="w-28"
        onChange={(e) => {
          const [h, m] = e.target.value.split(":").map(Number);
          if (h !== undefined && m !== undefined && !Number.isNaN(h) && !Number.isNaN(m)) set({ hour: h, minute: m });
        }} />
      {reset}
    </span>
  );
}

/** Now, rounded down to the minute, so the picker starts on today in Tehran. */
function tehranNowISO(): string {
  const n = jalaliInTehran();
  return tehranToUTC(n, n.hour, n.minute);
}

/** A UTC ISO string as the browser-local "YYYY-MM-DDTHH:MM" a datetime-local field wants. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
