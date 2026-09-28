// Shared by the calculator page (server) and the Calculator component (client). A plain module on purpose:
// values exported from a "use client" file reach server components only as client references.

/** A product the calculator can price (a domestic IRR series), with today's price when there is one. */
export type CalcProduct = {
  series: string;
  name: string;
  metal: { slug: string; name: string };
  category: { slug: string; name: string };
  priceRialPerKg?: number;
};

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
