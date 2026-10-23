/**
 * Jalali (Persian solar hijri) dates for date pickers: staff pick a Jalali day and a Tehran time, the API takes UTC.
 * Tehran is UTC+03:30 all year (Iran dropped daylight saving time in 2022). Pure integer arithmetic, no libraries.
 */

export type JalaliDate = { year: number; month: number; day: number };

export const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

const div = (a: number, b: number) => Math.trunc(a / b);

/** Jalali → Gregorian (the well-known jalaali-js arithmetic). */
export function jalaliToGregorian(jy: number, jm: number, jd: number): { year: number; month: number; day: number } {
  jy += 1595;
  let days = -355668 + 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm]!) gd -= monthDays[gm++]!;
  return { year: gy, month: gm, day: gd };
}

/** Days in a Jalali month: 31 for the first six, 30 for the next five, 29 or 30 for Esfand (leap years). */
export function jalaliMonthDays(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  const esfand1 = jalaliToGregorian(year, 12, 1);
  const nowruz = jalaliToGregorian(year + 1, 1, 1);
  const ms = Date.UTC(nowruz.year, nowruz.month - 1, nowruz.day) - Date.UTC(esfand1.year, esfand1.month - 1, esfand1.day);
  return Math.round(ms / 86_400_000);
}

/** Today's (or a moment's) Jalali date in Tehran. */
export function jalaliInTehran(at: Date = new Date()): JalaliDate & { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** A Jalali day and Tehran time → the UTC moment (ISO string) for the API. */
export function tehranToUTC(d: JalaliDate, hour: number, minute: number): string {
  const g = jalaliToGregorian(d.year, d.month, d.day);
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${g.year}-${pad(g.month)}-${pad(g.day)}T${pad(hour)}:${pad(minute)}:00+03:30`).toISOString();
}
