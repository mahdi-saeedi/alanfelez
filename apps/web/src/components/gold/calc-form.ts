// Shared by the calculator page (server) and the Calculator component (client). A plain module on purpose:
// values exported from a "use client" file reach server components only as client references.

/** A product the calculator can price (a domestic IRR series), with today's price when there is one. */
export type CalcProduct = {
  series: string;
  name: string;
  metal: { slug: string; name: string };
  category: { slug: string; name: string };
  priceRialPerKg?: number;
  /** Where today's price comes from and when it was last updated (shown next to it, CLAUDE.md copy rule). */
  source?: string;
  observedAt?: string;
};

/**
 * A Toman amount in words (client, 2026-10-31): «۸ میلیارد و ۷۵ میلیون تومان» reads faster than 8,075,000,000.
 * Rounded to the thousand; English uses billion/million with two decimals.
 */
export function amountInWords(toman: number, locale: "fa" | "en"): string {
  const n = Math.round(Math.abs(toman) / 1000) * 1000;
  if (locale === "en") {
    const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return n >= 1e9 ? `≈ ${fmt(n / 1e9)} billion Toman` : n >= 1e6 ? `≈ ${fmt(n / 1e6)} million Toman` : `≈ ${fmt(n)} Toman`;
  }
  const fa = (v: number) => v.toLocaleString("fa-IR");
  const parts: string[] = [];
  const b = Math.floor(n / 1e9), m = Math.floor((n % 1e9) / 1e6), k = Math.floor((n % 1e6) / 1e3);
  if (b) parts.push(`${fa(b)} میلیارد`);
  if (m) parts.push(`${fa(m)} میلیون`);
  if (k) parts.push(`${fa(k)} هزار`);
  return parts.length ? `${toman < 0 ? "منفی " : ""}${parts.join(" و ")} تومان` : "";
}

/** Form state as typed (strings, so Persian digits and decimals work), also what a share link carries. */
export type CalcForm = {
  series: string;
  weight: string;
  unit: "kg" | "ton";
  price: string;
  impurity: string;
  deductions: string;
  shipping: string;
  paidBy: "seller" | "buyer";
};

export const EMPTY_FORM: CalcForm = { series: "", weight: "1000", unit: "kg", price: "", impurity: "0", deductions: "0", shipping: "0", paidBy: "seller" };
