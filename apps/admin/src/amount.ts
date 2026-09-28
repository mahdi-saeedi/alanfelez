/**
 * Amount input for staff: they type what they read on a price board (Toman per kg for IRR series, dollars per ton
 * for USD series), Persian or Latin digits, with or without separators. The API takes integer minor units
 * (Rial/kg, cents/ton), so every conversion happens here, with integer math only.
 */
const DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

export function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] ?? d).replace(/[٫]/g, ".").replace(/[,٬\s]/g, "");
}

/** Parses a typed amount to API minor units, or null when it isn't a valid positive amount. */
export function toMinor(input: string, currency: "IRR" | "USD"): string | null {
  const s = normalizeDigits(input);
  if (currency === "IRR") {
    if (!/^\d+$/.test(s)) return null; // whole Toman
    const rial = BigInt(s) * 10n;
    return rial > 0n ? rial.toString() : null;
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s); // dollars with up to 2 decimals
  if (!m) return null;
  const cents = BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
  return cents > 0n ? cents.toString() : null;
}

/** Minor units back to the input unit (Toman or dollars) as a plain string, for pre-filling the form. */
export function fromMinor(amount: string, currency: "IRR" | "USD"): string {
  const v = BigInt(amount);
  if (currency === "IRR") return (v / 10n).toString();
  const cents = v % 100n;
  return `${v / 100n}${cents ? `.${cents.toString().padStart(2, "0")}` : ""}`;
}
