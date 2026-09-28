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
