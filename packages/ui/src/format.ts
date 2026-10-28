/** Locale-aware formatting shared by every UI. Money is integer Rial from the API, shown in Toman. */
export type Locale = "fa" | "en";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Converts ASCII digits to Persian digits (for strings that are not numbers, e.g. phone numbers). */
export function toPersianDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => PERSIAN_DIGITS.charAt(Number(d)));
}

/** Formats an integer amount with thousands separators in the locale's digits. */
export function formatNumber(n: number | bigint, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n);
}

/** Formats an API money amount (string of integer Rial) as Toman. */
export function formatToman(amountRial: string, locale: Locale): string {
  const toman = BigInt(amountRial) / 10n;
  return `${formatNumber(toman, locale)} ${locale === "fa" ? "تومان" : "Toman"}`;
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "fa" ? "rtl" : "ltr";
}

/** A price as the API sends it: integer minor units per unit (Rial/kg for IRR, US cents/ton for USD). */
export type ApiPrice = { amount: string; currency: "IRR" | "USD"; unit: "kg" | "ton" };

/** How to show IRR prices (SCOPE §14): Toman per kg by default, with Rial and per-ton switches. */
export type PriceDisplay = { rial?: boolean; perTon?: boolean };

const TEHRAN = "Asia/Tehran";

function nf(locale: Locale, opts?: Intl.NumberFormatOptions): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", opts);
}

/**
 * Converts an API amount to the displayed number. IRR: Rial → Toman (÷10) unless `rial`, kg → ton (×1000) if `perTon`.
 * USD: cents → dollars (per ton, the LME convention). Integer math only; the result is rounded to whole units.
 */
export function displayAmount(p: Pick<ApiPrice, "amount" | "currency" | "unit">, d: PriceDisplay = {}): bigint {
  let v = BigInt(p.amount);
  if (p.currency === "USD") return (v + 50n) / 100n;
  if (p.unit === "kg" && d.perTon) v *= 1000n;
  if (p.unit === "ton" && !d.perTon) v = v / 1000n;
  return d.rial ? v : (v + 5n) / 10n;
}

/** Formats a price's number part, e.g. "۶۴۰٬۰۰۰" or "9,800". */
export function formatPriceValue(p: ApiPrice, locale: Locale, d: PriceDisplay = {}): string {
  return nf(locale).format(displayAmount(p, d));
}

/** Unit label next to a price, e.g. "تومان/kg", "Toman/kg", "$/ton". */
export function priceUnitLabel(p: Pick<ApiPrice, "currency" | "unit">, locale: Locale, d: PriceDisplay = {}): string {
  if (p.currency === "USD") return "$/ton";
  const money = d.rial ? (locale === "fa" ? "ریال" : "Rial") : locale === "fa" ? "تومان" : "Toman";
  return `${money}/${d.perTon ? "ton" : "kg"}`;
}

/** Signed change amount in the same display units, e.g. "+۲٬۱۰۰". */
export function formatChangeValue(amount: string, p: Pick<ApiPrice, "currency" | "unit">, locale: Locale, d: PriceDisplay = {}): string {
  const neg = amount.startsWith("-");
  const abs = displayAmount({ amount: neg ? amount.slice(1) : amount, currency: p.currency, unit: p.unit }, d);
  const sign = abs === 0n ? "" : neg ? "−" : "+";
  return `${sign}${nf(locale).format(abs)}`;
}

/** Basis points as a signed percentage, e.g. 125 → "+1.25%" / "‎+۱٫۲۵٪". */
export function formatBp(bp: number, locale: Locale): string {
  return nf(locale, { style: "percent", signDisplay: "exceptZero", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bp / 10_000);
}

/** Clock time in Tehran, e.g. "۱۰:۳۲". */
export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TEHRAN }).format(new Date(iso));
}

/** Calendar date in Tehran: Jalali for fa ("۱ شهریور ۱۴۰۳"), Gregorian for en ("23 Aug 2024"). */
export function formatDate(iso: string, locale: Locale, withTime = false): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-GB", {
    day: "numeric",
    month: locale === "fa" ? "long" : "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: TEHRAN,
  }).format(new Date(iso));
}

/** Whole Tehran calendar days between `iso` and `now` (0 = today, 1 = yesterday), for "last updated" labels. */
export function tehranDaysAgo(iso: string, now: Date = new Date()): number {
  const day = (d: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: TEHRAN }).format(d)); // YYYY-MM-DD at UTC midnight
  return Math.round((day(now) - day(new Date(iso))) / 86_400_000);
}

/** A weight given in kg, shown in tonnes with at most one decimal ("۲٬۵۰۰٫۵ تن" / "2,500.5 t"). */
export function formatTons(kg: number, locale: Locale): string {
  const t = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 1 }).format(kg / 1000);
  return `${t} ${locale === "fa" ? "تن" : "t"}`;
}

/**
 * Parses a number typed by a user: Persian/Arabic digits, Persian decimal separator «٫» and thousands separators
 * are accepted. Returns undefined for empty or invalid input.
 */
export function parseDecimal(input: string): number | undefined {
  const s = input
    .trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٬,\s]/g, "")
    .replace(/[٫/]/g, ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
