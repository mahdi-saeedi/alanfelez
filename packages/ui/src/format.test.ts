import { test } from "node:test";
import assert from "node:assert/strict";
import { displayAmount, formatBp, formatChangeValue, formatDate, formatPriceValue, formatTime, formatToman, priceUnitLabel } from "./format.ts";

const copper = { amount: "6400000", currency: "IRR", unit: "kg" } as const; // 6,400,000 Rial/kg
const lme = { amount: "980012", currency: "USD", unit: "ton" } as const; // $9,800.12/ton

test("IRR is shown in Toman per kg by default, with Rial and per-ton switches", () => {
  assert.equal(displayAmount(copper), 640_000n);
  assert.equal(displayAmount(copper, { rial: true }), 6_400_000n);
  assert.equal(displayAmount(copper, { perTon: true }), 640_000_000n);
  assert.equal(displayAmount({ amount: "12345", currency: "IRR", unit: "kg" }), 1235n); // rounds half up
  assert.equal(formatPriceValue(copper, "en"), "640,000");
  assert.equal(formatPriceValue(copper, "fa"), "۶۴۰٬۰۰۰");
});

test("USD (LME) is shown in dollars per ton", () => {
  assert.equal(displayAmount(lme), 9_800n);
  assert.equal(priceUnitLabel(lme, "fa"), "$/ton");
  assert.equal(priceUnitLabel(copper, "fa"), "تومان/kg");
  assert.equal(priceUnitLabel(copper, "en", { rial: true, perTon: true }), "Rial/ton");
});

test("changes are signed", () => {
  assert.equal(formatChangeValue("21000", copper, "en"), "+2,100");
  assert.equal(formatChangeValue("-15000", copper, "en"), "−1,500");
  assert.equal(formatChangeValue("0", copper, "en"), "0");
  assert.equal(formatBp(125, "en"), "+1.25%");
  assert.equal(formatBp(-50, "en"), "-0.50%");
  assert.equal(formatBp(0, "en"), "0.00%");
  assert.match(formatBp(125, "fa"), /۱٫۲۵/);
});

test("times are Tehran time; fa dates are Jalali", () => {
  const iso = "2024-08-23T06:32:00Z"; // 10:02 in Tehran (+03:30)
  assert.equal(formatTime(iso, "en"), "10:02");
  assert.equal(formatTime(iso, "fa"), "۱۰:۰۲");
  assert.equal(formatDate(iso, "fa"), "۲ شهریور ۱۴۰۳");
  assert.equal(formatDate(iso, "en"), "23 Aug 2024");
});

test("plan prices stay in Toman", () => {
  assert.equal(formatToman("20000000", "en"), "2,000,000 Toman");
});
